'use strict';

// Tiny JSON file store with in-memory cache.
// Each named collection lives at <dir>/<name>.json, pretty-printed.

const fs = require('fs');
const path = require('path');

function genId() {
  return (
    Date.now().toString(36) +
    '-' +
    Math.random().toString(36).slice(2, 10)
  );
}

class Store {
  constructor(dir) {
    this.dir = dir;
    this.cache = Object.create(null);
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
  }

  filePath(name) {
    return path.join(this.dir, name + '.json');
  }

  read(name, fallback) {
    if (name in this.cache) return this.cache[name];
    try {
      const raw = fs.readFileSync(this.filePath(name), 'utf8');
      this.cache[name] = JSON.parse(raw);
    } catch (e) {
      this.cache[name] =
        fallback !== undefined ? JSON.parse(JSON.stringify(fallback)) : null;
    }
    return this.cache[name];
  }

  write(name, value) {
    this.cache[name] = value;
    fs.writeFileSync(this.filePath(name), JSON.stringify(value, null, 2) + '\n');
    return value;
  }

  // Create the file with a default value only if it does not exist yet.
  seed(name, fallback) {
    if (!fs.existsSync(this.filePath(name))) {
      this.write(name, JSON.parse(JSON.stringify(fallback)));
    }
  }
}

module.exports = { Store, genId };
