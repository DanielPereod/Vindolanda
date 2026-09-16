// Package auth provides single-account provisioning and revocable cookie sessions.
package auth

// User is the public representation of the provisioned account.
type User struct {
	ID       string `json:"id"`
	Username string `json:"username"`
}
type credentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}
type passwordChange struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}
