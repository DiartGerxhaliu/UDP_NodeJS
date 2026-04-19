# UDP Socket Server

Një server i thjeshtë UDP me menaxhim të skedarëve dhe monitorim përmes HTTP.

---

## Setup

Startoni serverin:

```bash
node server.js
```

Në një terminal tjetër startoni klientin:

```bash
node client.js
```

Për akses si admin:

```bash
node client.js --role admin --token admin-secret
```

Serveri krijon automatikisht folderin `server-data/` për ruajtjen e skedarëve.

---

## Komandat

### Komandat e disponueshme

```
/list [folder]        - shfaq skedarët
/read <filename>      - lexon një file
/info <filename>      - jep info për file
/search <keyword>     - kërkon file
/download <filename>  - shkarkon file

/upload <path>        - ngarkon file (vetëm admin)
/delete <filename>    - fshin file (vetëm admin)
/exec <filename>      - ekzekuton file .js ose .py (vetëm admin)

/reconnect            - rilidh klientin
/help                 - shfaq komandat
/quit                 - mbyll klientin
```

---

## Rolet

Ka dy role:

* **reader (default)**

  * mund të listojë, lexojë, kërkojë dhe shkarkojë file

* **admin**

  * ka akses të plotë (upload, delete, exec)

Admin nuk jepet automatikisht — duhet të jepet token i saktë gjatë nisjes së klientit.

---

## HTTP Stats

Për të parë statusin e serverit:

```bash
curl http://localhost:8080/stats
```

Kthen JSON me:

* klientët aktivë
* numrin total të mesazheve dhe komandave
* klientët e refuzuar
* logs
* informacion për klientët (role, IP, aktivitet)

---

## Si funksionon

* Serveri dëgjon në portin UDP **41234**
* HTTP server punon në portin **8080**
* Numri maksimal i klientëve është **3** (default)
* Klientët dërgojnë mesazhe dhe komanda përmes UDP
* Serveri i përpunon dhe kthen përgjigje
* Skedarët ruhen në folderin `server-data/`

---

## Transferimi i skedarëve

* Skedarët ndahen në pjesë (chunks) prej 4096 bytes
* Dërgohen në format Base64
* Ribashkohen në destinacion

---

## Kërkesat e realizuara

✓ Server UDP funksional
✓ Menaxhon shumë klientë
✓ Kufizon numrin e klientëve
✓ Mbështet role (admin / reader)
✓ Operacione me file: list, read, upload, download, delete, search, info
✓ Ekzekuton file `.js` dhe `.py`
✓ Monitorim me HTTP në portin 8080
✓ Statistika në format JSON
✓ Menaxhon reconnect dhe timeout

---

## Skedarët

```
server.js           - serveri UDP
client.js           - klienti
server-data/        - skedarët në server
client-downloads/   - skedarët e shkarkuar
README.md           - ky dokument
```
