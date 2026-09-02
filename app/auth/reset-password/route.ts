import { NextResponse } from "next/server"

export const runtime = "nodejs"

export async function GET() {
  const html = `<!doctype html>
<html lang="no">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Angre passord – Optimal Biehelse Norge</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        background: #fdfbf3;
        color: #1a1a1a;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }
      .card {
        width: 100%;
        max-width: 440px;
        background: #fff;
        border: 1px solid #e7e3d0;
        border-radius: 20px;
        padding: 28px 24px;
        box-shadow: 0 8px 30px rgba(0,0,0,0.06);
      }
      h1 { margin: 0 0 8px; font-size: 20px; }
      p { margin: 0 0 16px; font-size: 14px; color: #525252; }
      label { display: block; font-size: 14px; margin: 12px 0 6px; }
      input {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid #d8d3be;
        border-radius: 10px;
        background: #fff;
        font-size: 15px;
      }
      input:focus { outline: 2px solid #064e3b; outline-offset: 1px; border-color: #064e3b; }
      .error { background: #fde8e8; color: #7f1d1d; border: 1px solid #f5b5b5; padding: 10px 12px; border-radius: 10px; margin: 16px 0; font-size: 14px; }
      .success { background: #dcfce7; color: #14532d; border: 1px solid #86efac; padding: 10px 12px; border-radius: 10px; margin: 16px 0; font-size: 14px; }
      button {
        margin-top: 16px;
        width: 100%;
        background: #064e3b;
        color: #fff;
        border: 0;
        border-radius: 10px;
        padding: 12px 14px;
        font-size: 15px;
        cursor: pointer;
      }
      button:disabled { opacity: 0.6; cursor: not-allowed; }
      .foot { text-align: center; margin-top: 16px; font-size: 13px; color: #525252; }
      .foot a { color: #064e3b; text-decoration: underline; }
    </style>
  </head>
  <body>
    <form class="card" id="form" autocomplete="on">
      <h1>Angre passord</h1>
      <p>Skriv inn nytt passord for Min side.</p>

      <label for="p1">Nytt passord</label>
      <input id="p1" type="password" name="password" autocomplete="new-password" minlength="6" required />

      <label for="p2">Gjenta nytt passord</label>
      <input id="p2" type="password" autocomplete="new-password" minlength="6" required />

      <div id="msg"></div>

      <button id="btn" type="submit">Lagre nytt passord</button>

      <div class="foot">
        <a href="/min-side/login">Tilbake til innlogging</a>
      </div>
    </form>

    <script>
      (function () {
        var form = document.getElementById("form");
        var p1 = document.getElementById("p1");
        var p2 = document.getElementById("p2");
        var msg = document.getElementById("msg");
        var btn = document.getElementById("btn");

        function setError(text) {
          msg.className = "error";
          msg.textContent = text;
        }
        function setSuccess(text) {
          msg.className = "success";
          msg.textContent = text;
        }

        form.addEventListener("submit", async function (e) {
          e.preventDefault();
          msg.className = "";
          msg.textContent = "";

          var password = String(p1.value || "").trim();
          var password2 = String(p2.value || "").trim();
          if (!password) { setError("Skriv inn et nytt passord."); return; }
          if (password.length < 6) { setError("Passordet må være minst 6 tegn."); return; }
          if (password !== password2) { setError("Passordene er ikke like."); return; }

          btn.disabled = true;
          btn.textContent = "Lagrer…";
          try {
            var res = await fetch("/api/auth/reset-password", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ password: password }),
              cache: "no-store",
            });
            var data = {};
            try { data = await res.json(); } catch (_) {}
            if (!res.ok || !data.ok) {
              setError(data.feil || "Kunne ikke angi nytt passord. Prøv igjen.");
              return;
            }
            setSuccess("Passordet er endret. Om noen sekunder blir du sendt til Min side…");
            setTimeout(function () {
              window.location.href = "/min-side";
            }, 1200);
          } catch (err) {
            setError("Nettverksfeil. Prøv igjen.");
          } finally {
            btn.disabled = false;
            btn.textContent = "Lagre nytt passord";
          }
        });
      })();
    </script>
  </body>
</html>`
  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
}
