export class StreamHub {
  constructor() {
    this.clients = new Set();
    this._heartbeat = null;
  }

  start() {
    if (this._heartbeat) return;
    this._heartbeat = setInterval(() => {
      for (const res of this.clients) {
        try { res.write(': ping\n\n'); } catch {}
      }
    }, 25000);
  }

  add(res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write('retry: 3000\n\n');
    this.clients.add(res);
    res.on('close', () => this.clients.delete(res));
    this.clientCount = this.clients.size;
  }

  push(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of this.clients) {
      try { res.write(payload); } catch {}
    }
  }

  get size() {
    return this.clients.size;
  }
}