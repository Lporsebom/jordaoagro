// server.js
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./database');

const app = express();
const PORT = 3000;

// ===== Garante que a pasta uploads/ existe =====
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// ===== Configuração de upload de imagem =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } }); // 5 MB

// ===== Middlewares =====
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));
app.use(session({
  secret: 'troque-essa-chave-secreta-por-outra-mais-segura',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 7 dias
}));

// ===== Middlewares de proteção =====
const soAdmin = (req, res, next) => {
  if (!req.session.user || !req.session.user.is_admin)
    return res.status(403).json({ erro: 'Acesso restrito ao administrador' });
  next();
};

const logado = (req, res, next) => {
  if (!req.session.user)
    return res.status(401).json({ erro: 'Você precisa fazer login' });
  next();
};

// ================================================================
// ===== ROTAS DE PRODUTOS =====
// ================================================================

// Listar todos os produtos
app.get('/api/produtos', (req, res) => {
  const { categoria, q } = req.query;
  let sql = 'SELECT * FROM produtos';
  const params = [];
  const where = [];

  if (categoria) { where.push('categoria = ?'); params.push(categoria); }
  if (q) { where.push('(nome LIKE ? OR descricao LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }

  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY id DESC';

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json(rows);
  });
});

// Lista de categorias
app.get('/api/categorias', (req, res) => {
  db.all('SELECT DISTINCT categoria FROM produtos WHERE categoria IS NOT NULL ORDER BY categoria', [], (err, rows) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json(rows.map(r => r.categoria));
  });
});

// Criar produto (admin)
app.post('/api/produtos', soAdmin, upload.single('imagem'), (req, res) => {
  const { nome, descricao, preco, categoria } = req.body;
  const imagem = req.file ? req.file.filename : null;

  if (!nome || !preco) return res.status(400).json({ erro: 'Nome e preço são obrigatórios' });

  db.run(
    'INSERT INTO produtos (nome, descricao, preco, categoria, imagem) VALUES (?, ?, ?, ?, ?)',
    [nome, descricao || '', parseFloat(preco), categoria || '', imagem],
    function (err) {
      if (err) return res.status(500).json({ erro: err.message });
      res.json({ id: this.lastID, mensagem: 'Produto criado com sucesso' });
    }
  );
});

// Editar produto (admin)
app.put('/api/produtos/:id', soAdmin, upload.single('imagem'), (req, res) => {
  const { nome, descricao, preco, categoria } = req.body;
  const novaImagem = req.file ? req.file.filename : null;

  db.get('SELECT * FROM produtos WHERE id = ?', [req.params.id], (err, prod) => {
    if (err || !prod) return res.status(404).json({ erro: 'Produto não encontrado' });

    const imagem = novaImagem || prod.imagem;
    db.run(
      'UPDATE produtos SET nome = ?, descricao = ?, preco = ?, categoria = ?, imagem = ? WHERE id = ?',
      [nome, descricao, parseFloat(preco), categoria, imagem, req.params.id],
      (err) => {
        if (err) return res.status(500).json({ erro: err.message });
        res.json({ mensagem: 'Produto atualizado' });
      }
    );
  });
});

// Excluir produto (admin)
app.delete('/api/produtos/:id', soAdmin, (req, res) => {
  db.run('DELETE FROM produtos WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json({ mensagem: 'Produto excluído' });
  });
});

// ================================================================
// ===== IMPORTAÇÃO VIA EXCEL =====
// ================================================================
app.post('/api/produtos/importar', soAdmin, upload.single('planilha'), (req, res) => {
  if (!req.file) return res.status(400).json({ erro: 'Nenhuma planilha enviada' });

  try {
    const XLSX = require('xlsx');
    const wb = XLSX.readFile(req.file.path);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const linhas = XLSX.utils.sheet_to_json(ws);

    if (!linhas.length) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ erro: 'A planilha está vazia' });
    }

    const stmt = db.prepare(
      'INSERT INTO produtos (nome, descricao, preco, categoria) VALUES (?, ?, ?, ?)'
    );

    let importados = 0;
    linhas.forEach(l => {
      const nome = l.nome || l.Nome || l.NOME;
      const descricao = l.descricao || l.Descricao || l.Descrição || '';
      const preco = parseFloat(l.preco || l.Preco || l.Preço || 0);
      const categoria = l.categoria || l.Categoria || '';

      if (nome && preco > 0) {
        stmt.run(nome, descricao, preco, categoria);
        importados++;
      }
    });

    stmt.finalize();
    fs.unlinkSync(req.file.path);
    res.json({ importados, mensagem: `${importados} produtos importados com sucesso` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao processar a planilha: ' + err.message });
  }
});

// ================================================================
// ===== AUTENTICAÇÃO =====
// ================================================================

app.post('/api/cadastro', async (req, res) => {
  const { nome, email, senha } = req.body;
  if (!nome || !email || !senha) return res.status(400).json({ erro: 'Preencha todos os campos' });

  const hash = await bcrypt.hash(senha, 10);
  db.run(
    'INSERT INTO clientes (nome, email, senha) VALUES (?, ?, ?)',
    [nome, email, hash],
    function (err) {
      if (err) {
        if (err.message.includes('UNIQUE')) return res.status(400).json({ erro: 'E-mail já cadastrado' });
        return res.status(500).json({ erro: err.message });
      }
      res.json({ id: this.lastID, mensagem: 'Conta criada' });
    }
  );
});

app.post('/api/login', (req, res) => {
  const { email, senha } = req.body;
  db.get('SELECT * FROM clientes WHERE email = ?', [email], async (err, user) => {
    if (err) return res.status(500).json({ erro: err.message });
    if (!user) return res.status(401).json({ erro: 'E-mail ou senha inválidos' });

    const ok = await bcrypt.compare(senha, user.senha);
    if (!ok) return res.status(401).json({ erro: 'E-mail ou senha inválidos' });

    req.session.user = {
      id: user.id,
      nome: user.nome,
      email: user.email,
      is_admin: !!user.is_admin
    };
    res.json({ ok: true, nome: user.nome, is_admin: !!user.is_admin });
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  res.json(req.session.user || null);
});

// ================================================================
// ===== PEDIDOS =====
// ================================================================

app.post('/api/pedidos', logado, (req, res) => {
  const { produto_id, quantidade } = req.body;
  const qtd = quantidade || 1;

  db.get('SELECT preco FROM produtos WHERE id = ?', [produto_id], (err, prod) => {
    if (err || !prod) return res.status(404).json({ erro: 'Produto não encontrado' });

    const total = prod.preco * qtd;
    db.run(
      'INSERT INTO pedidos (cliente_id, produto_id, quantidade, total) VALUES (?, ?, ?, ?)',
      [req.session.user.id, produto_id, qtd, total],
      function (err) {
        if (err) return res.status(500).json({ erro: err.message });
        res.json({ id: this.lastID, mensagem: 'Pedido registrado' });
      }
    );
  });
});

app.get('/api/pedidos', logado, (req, res) => {
  db.all(`
    SELECT p.*, pr.nome AS produto_nome, pr.imagem AS produto_imagem
    FROM pedidos p
    JOIN produtos pr ON pr.id = p.produto_id
    WHERE p.cliente_id = ?
    ORDER BY p.data DESC
  `, [req.session.user.id], (err, rows) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json(rows);
  });
});

// Rota para o admin ver TODOS os pedidos
app.get('/api/pedidos/todos', soAdmin, (req, res) => {
  db.all(`
    SELECT p.*, pr.nome AS produto_nome, c.nome AS cliente_nome, c.email AS cliente_email
    FROM pedidos p
    JOIN produtos pr ON pr.id = p.produto_id
    JOIN clientes c ON c.id = p.cliente_id
    ORDER BY p.data DESC
  `, [], (err, rows) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json(rows);
  });
});

// ================================================================
// ===== INICIALIZAÇÃO =====
// ================================================================
app.listen(PORT, () => {
  console.log('');
  console.log('🌱 ================================');
  console.log(`🌱 Jordão Agropet rodando!`);
  console.log(`🌱 Acesse: http://localhost:${PORT}`);
  console.log('🌱 ================================');
  console.log('');
});