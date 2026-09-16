package nutrition

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"math"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"personal-life/api/internal/core"
)

// ErrRecipeNotFound reports a page without machine-readable recipe data.
var ErrRecipeNotFound = errors.New("recipe data not found")

const (
	// maxRecipeBytes bounds a fetched page before it is parsed.
	maxRecipeBytes = 1 << 20
	recipeTimeout  = 10 * time.Second
	maxIngredients = 100
	maxDescription = 4000
)

// RecipeImportClient fetches and parses a recipe from a public web page.
type RecipeImportClient interface {
	Recipe(context.Context, string) (ImportedRecipe, error)
}

// ImportedIngredient is one parsed ingredient line with its raw text preserved.
type ImportedIngredient struct {
	Raw      string  `json:"raw"`
	Name     string  `json:"name"`
	Quantity float64 `json:"quantity"`
	Unit     string  `json:"unit"`
}

// ImportedRecipe is the normalized recipe extracted from a page.
type ImportedRecipe struct {
	SourceURL   string               `json:"source_url"`
	Name        string               `json:"name"`
	Description string               `json:"description"`
	PrepMinutes int                  `json:"prep_minutes"`
	Servings    float64              `json:"servings"`
	Tags        []string             `json:"tags"`
	Ingredients []ImportedIngredient `json:"ingredients"`
}

type recipeImportClient struct {
	userAgent string
	http      *http.Client
}

// NewRecipeImportClient returns the production client with an SSRF guard.
func NewRecipeImportClient(userAgent string) RecipeImportClient {
	return newRecipeImportClient(userAgent)
}

func newRecipeImportClient(userAgent string) *recipeImportClient {
	if strings.TrimSpace(userAgent) == "" {
		userAgent = "personal-life/0.1 (personal nutrition tracker)"
	}
	return &recipeImportClient{
		userAgent: userAgent,
		http: &http.Client{
			Timeout:   recipeTimeout,
			Transport: guardedTransport(),
		},
	}
}

func (client *recipeImportClient) Recipe(requestContext context.Context, source string) (ImportedRecipe, error) {
	endpoint, operationError := parseRecipeURL(source)
	if operationError != nil {
		return ImportedRecipe{}, operationError
	}
	request, operationError := http.NewRequestWithContext(requestContext, http.MethodGet, endpoint.String(), nil)
	if operationError != nil {
		return ImportedRecipe{}, core.Invalid("Invalid recipe URL")
	}
	request.Header.Set("User-Agent", client.userAgent)
	request.Header.Set("Accept", "text/html,application/xhtml+xml")
	response, operationError := client.http.Do(request)
	if operationError != nil {
		return ImportedRecipe{}, core.Error{Status: 502, Message: "The recipe page is unavailable"}
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return ImportedRecipe{}, core.Error{Status: 502, Message: "The recipe page returned an unexpected response"}
	}
	body, operationError := io.ReadAll(io.LimitReader(response.Body, maxRecipeBytes))
	if operationError != nil {
		return ImportedRecipe{}, core.Error{Status: 502, Message: "The recipe page could not be read"}
	}
	return parseRecipeDocument(body, endpoint.String())
}

// parseRecipeURL accepts only plain web URLs.
func parseRecipeURL(source string) (*url.URL, error) {
	trimmed := strings.TrimSpace(source)
	if trimmed == "" || len(trimmed) > 2048 {
		return nil, core.Invalid("A recipe URL is required")
	}
	parsed, operationError := url.Parse(trimmed)
	if operationError != nil {
		return nil, core.Invalid("Invalid recipe URL")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil, core.Invalid("Only http and https recipe URLs are supported")
	}
	if strings.TrimSpace(parsed.Host) == "" {
		return nil, core.Invalid("Invalid recipe URL")
	}
	return parsed, nil
}

// guardedTransport refuses loopback, private, link-local and multicast
// addresses so a pasted URL cannot probe the host network.
func guardedTransport() *http.Transport {
	dialer := &net.Dialer{Timeout: 5 * time.Second, KeepAlive: 30 * time.Second}
	return &http.Transport{
		DialContext: func(requestContext context.Context, network, address string) (net.Conn, error) {
			host, port, operationError := net.SplitHostPort(address)
			if operationError != nil {
				return nil, operationError
			}
			addresses, operationError := net.DefaultResolver.LookupIPAddr(requestContext, host)
			if operationError != nil {
				return nil, operationError
			}
			for _, candidate := range addresses {
				if !isPublicAddress(candidate.IP) {
					continue
				}
				return dialer.DialContext(requestContext, network, net.JoinHostPort(candidate.IP.String(), port))
			}
			return nil, errors.New("recipe host is not publicly reachable")
		},
	}
}

func isPublicAddress(address net.IP) bool {
	return address.IsGlobalUnicast() &&
		!address.IsPrivate() &&
		!address.IsLoopback() &&
		!address.IsLinkLocalUnicast() &&
		!address.IsLinkLocalMulticast() &&
		!address.IsUnspecified()
}

// recipeDocument mirrors the schema.org/Recipe fields the importer consumes.
type recipeDocument struct {
	Name             string          `json:"name"`
	Description      string          `json:"description"`
	RecipeYield      json.RawMessage `json:"recipeYield"`
	RecipeIngredient json.RawMessage `json:"recipeIngredient"`
	TotalTime        string          `json:"totalTime"`
	PrepTime         string          `json:"prepTime"`
	Keywords         json.RawMessage `json:"keywords"`
	RecipeCategory   json.RawMessage `json:"recipeCategory"`
}

// parseRecipeDocument finds the first JSON-LD recipe and normalizes it.
func parseRecipeDocument(body []byte, sourceURL string) (ImportedRecipe, error) {
	for _, block := range jsonLDScripts(body) {
		var payload any
		if operationError := json.Unmarshal([]byte(block), &payload); operationError != nil {
			continue
		}
		node := findRecipeNode(payload)
		if node == nil {
			continue
		}
		raw, operationError := json.Marshal(node)
		if operationError != nil {
			continue
		}
		var document recipeDocument
		if operationError := json.Unmarshal(raw, &document); operationError != nil {
			continue
		}
		imported := recipeFromDocument(document, sourceURL)
		if imported.Name != "" {
			return imported, nil
		}
	}
	return ImportedRecipe{}, ErrRecipeNotFound
}

// jsonLDScripts extracts the body of every application/ld+json script block.
func jsonLDScripts(body []byte) []string {
	lowered := strings.ToLower(string(body))
	scripts := []string{}
	offset := 0
	for {
		start := strings.Index(lowered[offset:], "<script")
		if start < 0 {
			break
		}
		start += offset
		tagEnd := strings.Index(lowered[start:], ">")
		if tagEnd < 0 {
			break
		}
		tagEnd += start
		contentStart := tagEnd + 1
		closeAt := strings.Index(lowered[contentStart:], "</script")
		if closeAt < 0 {
			break
		}
		closeAt += contentStart
		if strings.Contains(lowered[start:tagEnd], "application/ld+json") {
			scripts = append(scripts, string(body[contentStart:closeAt]))
		}
		offset = closeAt + len("</script")
	}
	return scripts
}

// findRecipeNode walks arrays and @graph collections for a Recipe node.
func findRecipeNode(value any) map[string]any {
	switch typed := value.(type) {
	case []any:
		for _, item := range typed {
			if found := findRecipeNode(item); found != nil {
				return found
			}
		}
	case map[string]any:
		if isRecipeType(typed["@type"]) {
			return typed
		}
		if found := findRecipeNode(typed["@graph"]); found != nil {
			return found
		}
	}
	return nil
}

func isRecipeType(value any) bool {
	switch typed := value.(type) {
	case string:
		return strings.EqualFold(strings.TrimSpace(typed), "Recipe")
	case []any:
		for _, item := range typed {
			if isRecipeType(item) {
				return true
			}
		}
	}
	return false
}

func recipeFromDocument(document recipeDocument, sourceURL string) ImportedRecipe {
	lines := stringList(document.RecipeIngredient)
	ingredients := make([]ImportedIngredient, 0, len(lines))
	for _, line := range lines {
		if len(ingredients) >= maxIngredients {
			break
		}
		if trimmed := strings.TrimSpace(line); trimmed != "" {
			ingredients = append(ingredients, parseIngredientLine(trimmed))
		}
	}
	servings := parseYield(document.RecipeYield)
	if servings <= 0 || servings > 1000 {
		servings = 1
	}
	description := strings.TrimSpace(document.Description)
	if len(description) > maxDescription {
		description = description[:maxDescription]
	}
	return ImportedRecipe{
		SourceURL:   sourceURL,
		Name:        strings.TrimSpace(document.Name),
		Description: description,
		PrepMinutes: durationMinutes(firstNonEmpty(document.TotalTime, document.PrepTime)),
		Servings:    servings,
		Tags:        recipeTags(document),
		Ingredients: ingredients,
	}
}

var (
	mixedQuantityPattern    = regexp.MustCompile(`^(\d+)\s+(\d+)/(\d+)`)
	fractionQuantityPattern = regexp.MustCompile(`^(\d+)/(\d+)`)
	decimalQuantityPattern  = regexp.MustCompile(`^(\d+(?:[.,]\d+)?)`)
	durationPattern         = regexp.MustCompile(`^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$`)
)

var unicodeFractions = map[rune]float64{
	'½': 0.5, '⅓': 1.0 / 3, '⅔': 2.0 / 3, '¼': 0.25, '¾': 0.75,
	'⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8,
	'⅙': 1.0 / 6, '⅚': 5.0 / 6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
}

// ingredientUnits recognizes the unit word after a quantity so it is stripped
// from the ingredient name.
var ingredientUnits = map[string]bool{
	"g": true, "gr": true, "gramo": true, "gramos": true, "kg": true, "kilo": true, "kilos": true,
	"ml": true, "cl": true, "l": true, "litro": true, "litros": true,
	"cucharada": true, "cucharadas": true, "cda": true, "cdas": true, "cucharadita": true, "cucharaditas": true, "cdta": true, "cdtas": true,
	"taza": true, "tazas": true, "vaso": true, "vasos": true,
	"unidad": true, "unidades": true, "ud": true, "uds": true, "pieza": true, "piezas": true,
	"diente": true, "dientes": true, "lata": true, "latas": true, "sobre": true, "sobres": true,
	"pizca": true, "pizcas": true, "ramita": true, "ramitas": true, "hoja": true, "hojas": true,
	"cup": true, "cups": true, "tbsp": true, "tsp": true, "oz": true, "lb": true, "lbs": true,
	"clove": true, "cloves": true, "can": true, "cans": true, "bunch": true, "slice": true, "slices": true, "pinch": true,
}

// parseIngredientLine splits "200 g de yogur" into quantity, unit and name.
func parseIngredientLine(raw string) ImportedIngredient {
	cleaned := strings.TrimSpace(strings.TrimLeft(raw, "•-–—*"))
	quantity, rest := parseLeadingQuantity(cleaned)
	unit := ""
	if quantity > 0 {
		candidate := rest
		if lowered := strings.ToLower(candidate); strings.HasPrefix(lowered, "de ") || strings.HasPrefix(lowered, "of ") {
			candidate = strings.TrimSpace(candidate[3:])
		}
		if token, remainder := splitFirstToken(candidate); ingredientUnits[strings.ToLower(token)] {
			unit = strings.ToLower(token)
			rest = remainder
		}
	}
	name := strings.TrimSpace(rest)
	if lowered := strings.ToLower(name); strings.HasPrefix(lowered, "de ") || strings.HasPrefix(lowered, "of ") {
		name = strings.TrimSpace(name[3:])
	}
	if name == "" {
		name = cleaned
	}
	return ImportedIngredient{Raw: raw, Name: name, Quantity: quantity, Unit: unit}
}

func parseLeadingQuantity(text string) (float64, string) {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return 0, ""
	}
	runes := []rune(trimmed)
	if fraction, present := unicodeFractions[runes[0]]; present {
		return round2(fraction), strings.TrimSpace(string(runes[1:]))
	}
	if match := mixedQuantityPattern.FindStringSubmatch(trimmed); match != nil {
		denominator := parseNumber(match[3])
		if denominator > 0 {
			return round2(parseNumber(match[1]) + parseNumber(match[2])/denominator), strings.TrimSpace(trimmed[len(match[0]):])
		}
	}
	if match := fractionQuantityPattern.FindStringSubmatch(trimmed); match != nil {
		denominator := parseNumber(match[2])
		if denominator > 0 {
			return round2(parseNumber(match[1]) / denominator), strings.TrimSpace(trimmed[len(match[0]):])
		}
	}
	if match := decimalQuantityPattern.FindStringSubmatch(trimmed); match != nil {
		return round2(parseNumber(match[1])), strings.TrimSpace(trimmed[len(match[0]):])
	}
	return 0, trimmed
}

func parseNumber(value string) float64 {
	parsed, operationError := strconv.ParseFloat(strings.ReplaceAll(strings.TrimSpace(value), ",", "."), 64)
	if operationError != nil || math.IsNaN(parsed) || math.IsInf(parsed, 0) {
		return 0
	}
	return parsed
}

func splitFirstToken(text string) (string, string) {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return "", ""
	}
	if index := strings.IndexAny(trimmed, " \t"); index >= 0 {
		return trimmed[:index], strings.TrimSpace(trimmed[index+1:])
	}
	return trimmed, ""
}

// durationMinutes converts an ISO 8601 duration such as PT1H30M to minutes.
func durationMinutes(value string) int {
	match := durationPattern.FindStringSubmatch(strings.ToUpper(strings.TrimSpace(value)))
	if match == nil {
		return 0
	}
	days := parseNumber(match[1])
	minutes := days*24*60 + parseNumber(match[2])*60 + parseNumber(match[3])
	if parseNumber(match[4]) >= 30 {
		minutes++
	}
	if minutes <= 0 || minutes > 10000 {
		return 0
	}
	return int(minutes)
}

// parseYield reads recipeYield as a number, a string or a single-item list.
func parseYield(raw json.RawMessage) float64 {
	for _, candidate := range stringList(raw) {
		if match := decimalQuantityPattern.FindStringSubmatch(strings.TrimSpace(candidate)); match != nil {
			return round2(parseNumber(match[1]))
		}
	}
	return 0
}

func recipeTags(document recipeDocument) []string {
	tags := []string{}
	seen := map[string]bool{}
	for _, value := range append(stringList(document.Keywords), stringList(document.RecipeCategory)...) {
		for _, part := range strings.Split(value, ",") {
			trimmed := strings.TrimSpace(part)
			if trimmed == "" || len(trimmed) > 50 || len(tags) >= 20 {
				continue
			}
			key := strings.ToLower(trimmed)
			if seen[key] {
				continue
			}
			seen[key] = true
			tags = append(tags, trimmed)
		}
	}
	return tags
}

// stringList decodes a JSON-LD value that may be a string, number or list.
func stringList(raw json.RawMessage) []string {
	if len(raw) == 0 {
		return nil
	}
	var value any
	if operationError := json.Unmarshal(raw, &value); operationError != nil {
		return nil
	}
	return stringListValue(value)
}

func stringListValue(value any) []string {
	switch typed := value.(type) {
	case string:
		return []string{typed}
	case []any:
		values := make([]string, 0, len(typed))
		for _, item := range typed {
			values = append(values, stringListValue(item)...)
		}
		return values
	case float64:
		return []string{strconv.FormatFloat(typed, 'f', -1, 64)}
	}
	return nil
}
