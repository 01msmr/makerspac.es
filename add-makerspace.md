## Makerspace manuell hinzufügen

1. `locations.json` öffnen
2. Neuen Eintrag an der richtigen Stelle einfügen (sortiert: Land > PLZ > Name)
3. ID: nächste freie ID verwenden (höchste vorhandene ID + 1)
4. Felder korrekt befüllen:

**style** – eines der folgenden Werte:
- `"for all"`
- `"for youth"`
- `"for students"`
- `"commercial"`

**workshops** – Array mit Workshop-IDs (leer = `[]`):
- `"3d"` – 3D-Druck / 3D printing
- `"laser"` – Laser / Laser cutting
- `"electronics"` – Elektronik / Electronics
- `"wood"` – Holzwerkstatt / Woodworking
- `"metal"` – Metallwerkstatt / Metalworking
- `"textile"` – Textil / Textile
- `"cnc"` – CNC / CNC machining
- `"bio"` – Bio/Labor / Bio/Lab
- `"vr"` – VR

5. Pull Request erstellen – danke! 💛
