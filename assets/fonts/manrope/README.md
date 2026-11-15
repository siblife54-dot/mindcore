# Manrope

Self-hosted Manrope variable font, weights 200–800, normal style. These unmodified
Google Fonts v23 WOFF2 subsets cover Turkish (Latin + Latin Extended) and Russian
(Cyrillic). Total size: 54,044 bytes. The accompanying OFL.txt contains the SIL
Open Font License and copyright notices.

Sources:

- CSS manifest: https://fonts.googleapis.com/css2?family=Manrope:wght@200..800&display=swap
- Latin: https://fonts.gstatic.com/s/manrope/v23/xn7gYHE41ni1AdIRggexSg.woff2
- Latin Extended: https://fonts.gstatic.com/s/manrope/v23/xn7gYHE41ni1AdIRggmxSuXd.woff2
- Cyrillic: https://fonts.gstatic.com/s/manrope/v23/xn7gYHE41ni1AdIRggOxSuXd.woff2
- License: https://github.com/google/fonts/blob/b31870aff700ab7a1d74fa0c6887d95beb9e0037/ofl/manrope/OFL.txt

SHA-256:

| File | Digest |
| --- | --- |
| manrope-latin-wght.woff2 | 8c2def024c1bf31aacf3624ae3c4d701269b4ec3dc765c04830839f0d36b2d9e |
| manrope-latin-ext-wght.woff2 | 2f7335119075b2079f1d882530bbc18728461612bf90743203d73a74a48f4d9b |
| manrope-cyrillic-wght.woff2 | 447c49583b1b735cc6f566151db1d24354cec41076c55dd98455cfbde9e806c1 |

`app.js` exposes the resolved course ID on the document root before startup.
`styles.css` applies Manrope only to course_1781255103582 (Valeria), including
form controls. Other courses retain their existing font stack and do not request
these font files. No external font service is contacted at runtime. Heading sizes,
weights, spacing, colors and layout are unchanged.
