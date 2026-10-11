# QRAuth

Offline iPhone client, as a web app, for `pam_qrauth`: a challenge-response PAM module written for a university
course on operating system security (laboratory work 6, Linux authentication). Work in progress.

The module shows a one-time challenge as a QR code in the terminal; the app scans it and shows a 6-digit OCRA
response (RFC 6287, suite `OCRA-1:HOTP-SHA256-6:QH40`) computed from a secret shared at enrollment.

Published at https://ibks-repos.github.io/qrauth-pwa/. This repository is a mirror of `Lab6/pwa` of the course
repository and is updated by `scripts/publish.sh` there.

```sh
npm ci
npm test
npm run dev
npm run build
```

Licensed under the MIT license. The bundled QR decoder is zxing-wasm (MIT; zxing-cpp, Apache 2.0).
