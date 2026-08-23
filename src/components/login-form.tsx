"use client";

import { LockKeyhole, PackageOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(payload.message ?? "登录失败");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("网络连接失败，请再试一次");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="login-mark" aria-hidden="true">
          <PackageOpen size={31} strokeWidth={1.8} />
        </div>
        <div>
          <p className="eyebrow">DAI INVENTORY</p>
          <h1>欢迎回来</h1>
          <p className="muted login-copy">输入你的库存访问密码。</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <label htmlFor="password">访问密码</label>
          <div className="password-field">
            <LockKeyhole size={18} aria-hidden="true" />
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••••••"
              required
              autoFocus
            />
          </div>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="button primary full" type="submit" disabled={pending}>
            {pending ? "正在验证…" : "进入库存"}
          </button>
        </form>
        <p className="privacy-note">数据保存在你的私有数据库，密码不会发送到浏览器端。</p>
      </section>
    </main>
  );
}
