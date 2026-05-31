import React, { useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext.js";

export function RegisterForm({ onSwitch }: { onSwitch: () => void }) {
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setError("");
      await register(email, password, name);
      setSuccess(true);
      setTimeout(onSwitch, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Create Account</h2>
      {success && <p className="success">Account created! Redirecting to login...</p>}
      {error && <p className="error">{error}</p>}
      <input
        type="text"
        placeholder="Full Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <input
        type="password"
        placeholder="Password (min 8 characters)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        minLength={8}
        required
      />
      <button type="submit">Register</button>
      <p>
        Already have an account? <button type="button" onClick={onSwitch}>Sign in</button>
      </p>
    </form>
  );
}
