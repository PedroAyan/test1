import fs from 'fs';
import path from 'path';

export class MarketCache {
  private readonly filePath: string;
  private seen: Set<string> = new Set();

  constructor(filePath?: string) {
    this.filePath = filePath || path.join(process.cwd(), 'data', 'market-cache.json');
    this.load();
  }

  private load() {
    try {
      const content = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(content);
      this.seen = new Set(parsed);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('Failed to read market cache', error);
      }
      this.ensureDir();
      this.persist();
    }
  }

  private ensureDir() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private persist() {
    this.ensureDir();
    fs.writeFileSync(this.filePath, JSON.stringify(Array.from(this.seen), null, 2));
  }

  has(marketId: string) {
    return this.seen.has(marketId);
  }

  add(marketId: string) {
    if (!this.seen.has(marketId)) {
      this.seen.add(marketId);
      this.persist();
    }
  }
}
