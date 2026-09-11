// ===== Variável global =====
let todosProdutos = [];

// ===== Formatar preço em R$ =====
function formatarPreco(valor) {
  return 'R$ ' + Number(valor).toFixed(2).replace('.', ',');
}

// ===== Renderizar produtos na home =====
function renderizarProdutos(produtos) {
  const grid = document.getElementById('gridProdutos');
  if (!grid) return;

  if (!produtos || produtos.length === 0) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:#666;">
        <p style="font-size:18px;margin-bottom:8px;">Nenhum produto cadastrado ainda.</p>
        <p style="font-size:14px;">Volte em breve! 🌱</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = produtos.map(p => {
    const imagem = p.imagem
      ? `/uploads/${p.imagem}`
      : 'https://via.placeholder.com/300x180/4caf50/ffffff?text=Sem+foto';

    const parcelas = (p.preco / 5).toFixed(2).replace('.', ',');

    return `
      <div class="card">
        <img src="${imagem}" alt="${p.nome}" onerror="this.src='https://via.placeholder.com/300x180/4caf50/ffffff?text=Sem+foto'">
        <div class="card-body">
          <h3>${p.nome}</h3>
          <p class="descricao">${p.descricao || ''}</p>
          <span class="preco">${formatarPreco(p.preco)}</span>
          <span class="parcelamento">ou 5x de ${formatarPreco(p.preco / 5)}</span>
          <button class="btn-comprar" onclick="comprar(${p.id})">Comprar pelo WhatsApp</button>
        </div>
      </div>
    `;
  }).join('');
}

// ===== Carregar produtos do backend =====
async function carregarProdutos() {
  try {
    const res = await fetch('/api/produtos');
    if (!res.ok) throw new Error('Erro ao buscar produtos');
    const produtos = await res.json();
    todosProdutos = produtos;
    renderizarProdutos(produtos);
  } catch (err) {
    console.error('Erro:', err);
    const grid = document.getElementById('gridProdutos');
    if (grid) {
      grid.innerHTML = `
        <p style="grid-column:1/-1;text-align:center;color:#c62828;padding:40px;">
          Erro ao carregar produtos. O servidor está rodando?
        </p>
      `;
    }
  }
}

// ===== Comprar pelo WhatsApp =====
async function comprar(id) {
  const produto = todosProdutos.find(p => p.id === id);
  if (!produto) return alert('Produto não encontrado');

  // Tenta registrar o pedido (se estiver logado)
  try {
    const res = await fetch('/api/pedidos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ produto_id: id, quantidade: 1 })
    });

    if (res.status === 401) {
      // Não está logado — redireciona pro login
      const quer = confirm(
        'Você precisa estar logado para registrar a compra. Deseja fazer login agora?\n\n' +
        '(Se preferir, pode continuar direto pro WhatsApp)'
      );
      if (quer) {
        window.location.href = 'login.html';
        return;
      }
    }
  } catch (err) {
    console.error('Erro ao registrar pedido:', err);
  }

  // Abre o WhatsApp com a mensagem do produto
  const mensagem = `Olá, eu vim do site da Jordão Agropet!\n\nTenho interesse no produto:\n\n*${produto.nome}*\nValor: ${formatarPreco(produto.preco)}\n\nQuantidade: 1\n\nAinda está disponível?`;
  const url = `https://wa.me/5519990143597?text=${encodeURIComponent(mensagem)}`;
  window.open(url, '_blank');
}

// ===== Busca de produtos =====
function buscar() {
  const campo = document.getElementById('campoBusca');
  if (!campo) return;
  const termo = campo.value.trim().toLowerCase();

  if (!termo) {
    renderizarProdutos(todosProdutos);
    return;
  }

  const filtrados = todosProdutos.filter(p =>
    p.nome.toLowerCase().includes(termo) ||
    (p.descricao && p.descricao.toLowerCase().includes(termo)) ||
    (p.categoria && p.categoria.toLowerCase().includes(termo))
  );

  const grid = document.getElementById('gridProdutos');
  if (filtrados.length === 0) {
    grid.innerHTML = `
      <p style="grid-column:1/-1;text-align:center;color:#666;padding:40px;">
        Nenhum produto encontrado para "<strong>${termo}</strong>"
      </p>
    `;
    return;
  }

  renderizarProdutos(filtrados);
}

// ===== Verificar se está logado =====
async function verificarLogin() {
  const linkLogin = document.getElementById('linkLogin');
  const linkHistorico = document.getElementById('linkHistorico');
  if (!linkLogin) return;

  try {
    const res = await fetch('/api/me');
    if (!res.ok) throw new Error('offline');
    const me = await res.json();

    if (me) {
      linkLogin.textContent = 'Sair (' + me.nome.split(' ')[0] + ')';
      linkLogin.href = '#';
      linkLogin.onclick = async (e) => {
        e.preventDefault();
        await fetch('/api/logout', { method: 'POST' });
        window.location.reload();
      };

      // Mostra link "Minhas Compras" só se logado
      if (linkHistorico) {
        linkHistorico.style.display = 'inline-block';
        linkHistorico.href = 'historico.html';
      }
    } else {
      // Não logado: esconde o link de histórico
      if (linkHistorico) linkHistorico.style.display = 'none';
    }
  } catch {
    // Backend não está rodando
  }
}

// ===== Inicializar =====
document.addEventListener('DOMContentLoaded', () => {
  carregarProdutos();
  verificarLogin();

  // Se veio busca pela URL (?busca=termo), já aplica
  const params = new URLSearchParams(window.location.search);
  const termoUrl = params.get('busca');
  if (termoUrl) {
    const campo = document.getElementById('campoBusca');
    if (campo) campo.value = termoUrl;
    // Aguarda os produtos carregarem, depois filtra
    setTimeout(() => buscar(), 500);
  }
});