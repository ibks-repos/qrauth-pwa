# QRAuth

Offline iPhone client, as a Home Screen web app, for `pam_qrauth`: a challenge-response PAM module written for a
university course on operating system security (laboratory work 6, authentication in Linux).

The module shows a one-time challenge as a QR code in the terminal; QRAuth scans it and shows a 6-digit OCRA
response (RFC 6287, suite `OCRA-1:HOTP-SHA256-6:QH40`) computed from a secret that the server handed over once,
as an enrollment QR code. The person types the response; the app never talks to the computer.

Open https://ibks-repos.github.io/qrauth-pwa/ in Safari on the iPhone, then Share, Add to Home Screen.

## Payloads

```
challenge   qrauth:1:c:<user>@<host>:<service>:<40 lowercase hex digits>
enrollment  qrauth:1:e:<user>@<host>:<base32 secret, no padding>:OCRA-1:HOTP-SHA256-6:QH40
```

## Security model

- Secrets are imported into non-extractable WebCrypto HMAC keys stored in IndexedDB; on Apple platforms WebKit
  encrypts stored keys under a master key in the Keychain. Optionally an account is protected with Face ID: its
  key is wrapped with AES-256-GCM under a key derived (HKDF) from the PRF output of the app's passkey, which the
  platform releases only after user verification.
- After the first start the service worker serves everything from its cache; the app makes no network requests,
  has no analytics and loads nothing from third parties (the QR decoder's WebAssembly file is bundled).
  Content Security Policy: `default-src 'self'`, no inline scripts or styles.
- Every code is shown with the account and the PAM service it approves; a challenge for an unknown account gives
  no code. The local log keeps events, never codes, challenges or secrets.
- The origin `ibks-repos.github.io` is shared by all GitHub Pages sites of the organization; it is the trust
  boundary of the stored data and of the passkey.

## Development

```sh
npm ci
npm test                         # Vitest: OCRA (RFC 6287 vectors), payloads, base32, decoder
npx playwright install webkit
npm run test:webkit              # the app in WebKit with an iPhone viewport
npm run dev
npm run build
```

This repository mirrors `Lab6/pwa` of the course repository, from which `scripts/publish.sh` updates it; pushes
to `main` are tested, built and deployed to GitHub Pages by `.github/workflows/pages.yml`.

Licensed under the MIT license. The bundled QR decoder is zxing-wasm (MIT) built from zxing-cpp (Apache 2.0).
