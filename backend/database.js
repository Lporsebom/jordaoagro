// database.js
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'database.db'));

db.serialize(() => {
  // Tabela de clientes
  db.run(`CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    senha TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    criado_em TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  // Tabela de produtos
  db.run(`CREATE TABLE IF NOT EXISTS produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    descricao TEXT,
    preco REAL NOT NULL,
    categoria TEXT,
    imagem TEXT,
    criado_em TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  // Tabela de pedidos
  db.run(`CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER,
    produto_id INTEGER,
    quantidade INTEGER DEFAULT 1,
    total REAL,
    status TEXT DEFAULT 'pendente',
    data TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(cliente_id) REFERENCES clientes(id),
    FOREIGN KEY(produto_id) REFERENCES produtos(id)
  )`);

  // Cria o admin padrão se não existir
  db.get(`SELECT * FROM clientes WHERE email = 'admin@jordaoagropet.com'`, (err, row) => {
    if (!row) {
      const hash = bcrypt.hashSync('jordao2026', 10);
      db.run(
        `INSERT INTO clientes (nome, email, senha, is_admin) VALUES (?, ?, ?, 1)`,
        ['Administrador', 'admin@jordaoagropet.com', hash],
        (err) => {
          if (err) console.error('Erro ao criar admin:', err);
          else console.log('✅ Admin padrão criado: admin@jordaoagropet.com / jordao2026');
        }
      );
    }
  });
});

console.log('📦 Banco de dados pronto (database.db)');
module.exports = db;