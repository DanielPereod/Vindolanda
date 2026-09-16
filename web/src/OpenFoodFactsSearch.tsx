import { useState } from "react";
import type { FormEvent } from "react";
import { Search } from "lucide-react";
import { api, errorMessage } from "./api";
import type { OpenFoodFactsProduct } from "./types";

/** Búsqueda por texto o código de barras e importación desde Open Food Facts. */
export function OpenFoodFactsSearch({
  onImported,
}: {
  onImported: () => void;
}) {
  const [barcode, setBarcode] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OpenFoodFactsProduct[]>([]);
  const [searched, setSearched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function run(operation: () => Promise<void>) {
    setPending(true);
    setError("");
    setMessage("");
    try {
      await operation();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPending(false);
    }
  }

  function lookup(event: FormEvent) {
    event.preventDefault();
    const code = barcode.trim();
    if (!code) return;
    void run(async () => {
      const product = await api<OpenFoodFactsProduct>(
        `/nutrition/foods/lookup?barcode=${encodeURIComponent(code)}`,
      );
      setResults([product]);
      setSearched(true);
    });
  }

  function search(event: FormEvent) {
    event.preventDefault();
    const text = query.trim();
    if (!text) return;
    void run(async () => {
      const products = await api<OpenFoodFactsProduct[]>(
        `/nutrition/foods/openfoodfacts?q=${encodeURIComponent(text)}`,
      );
      setResults(products);
      setSearched(true);
    });
  }

  function importProduct(product: OpenFoodFactsProduct) {
    void run(async () => {
      await api("/nutrition/foods/import", "POST", {
        barcode: product.barcode,
      });
      setMessage(`«${product.name}» importado`);
      onImported();
    });
  }

  return (
    <div className="editor">
      <form className="off-row" onSubmit={lookup}>
        <label>
          Código de barras
          <input
            inputMode="numeric"
            placeholder="8412345678901"
            value={barcode}
            onChange={(event) => setBarcode(event.target.value)}
          />
        </label>
        <button className="secondary" disabled={pending}>
          Buscar código
        </button>
      </form>
      <form className="off-row" onSubmit={search}>
        <label>
          Buscar por nombre
          <input
            placeholder="yogur griego…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button className="secondary" disabled={pending}>
          <Search size={15} />
          Buscar
        </button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && <p className="muted">{message}</p>}
      {pending && <p className="muted loading">Consultando Open Food Facts…</p>}
      {!pending && searched && results.length === 0 && (
        <p className="muted">Sin resultados en Open Food Facts.</p>
      )}
      {results.length > 0 && (
        <div className="off-results">
          {results.map((product) => (
            <article className="off-result" key={product.barcode}>
              <div>
                <strong>{product.name}</strong>
                {product.brand && (
                  <span className="muted"> · {product.brand}</span>
                )}
                <p className="muted">
                  {product.base_quantity} {product.base_unit} ·{" "}
                  {product.calories_kcal} kcal · {product.protein_g} P ·{" "}
                  {product.carbs_g} C · {product.fat_g} G
                </p>
              </div>
              <button
                className="primary"
                disabled={pending}
                onClick={() => importProduct(product)}
              >
                Importar
              </button>
            </article>
          ))}
        </div>
      )}
      <p className="muted off-attribution">
        Datos de Open Food Facts, disponibles bajo licencia ODbL.
      </p>
    </div>
  );
}
