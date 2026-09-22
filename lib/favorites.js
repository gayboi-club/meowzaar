import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'data', 'favorites.json');

export class FavoritesStore {
  constructor() {
    this.ids = new Set();
    this._loaded = false;
  }

  async load() {
    try {
      const raw = await fs.readFile(FILE, 'utf8');
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) this.ids = new Set(arr);
    } catch { this.ids = new Set(); }
    this._loaded = true;
    return this.ids;
  }

  async save() {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify([...this.ids]), 'utf8');
  }

  async add(id) {
    if (!this._loaded) await this.load();
    this.ids.add(id);
    await this.save();
    return { ok: true, ids: [...this.ids] };
  }

  async remove(id) {
    if (!this._loaded) await this.load();
    this.ids.delete(id);
    await this.save();
    return { ok: true, ids: [...this.ids] };
  }

  async list() {
    if (!this._loaded) await this.load();
    return [...this.ids];
  }
}