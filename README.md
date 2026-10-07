# Volley

A 2v2 beach volleyball dice game in the browser. Every touch is a dice roll: serve, pass, set, attack, block and dig. On attack you choose line, cross or tip. On defence you choose where to block and whether to dig deep or creep in for the tip. Read the other side right and you stuff the block or dig the ball; guess wrong and it's a kill. First to 21, win by 2.

![A stuff block in Volley](docs/screenshot.jpg)

## Run

```sh
npm install
npm run dev
```

Then open http://localhost:5173 and press Space to play. When it's your call, pick a shot (or a block and dig) and press Space to roll the attack.

## Deploy

Live at https://volley.bevsoft.com. Tag the commit and deploy from your machine with Skaffold:

```sh
git tag v0.1.0 && git push origin v0.1.0
skaffold run
```
