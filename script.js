// ============================================================
// AUTOSSUFICIÊNCIA
// ============================================================
if (typeof obterRole !== 'function') {
    globalThis.obterRole = function () {
        try {
            const role = localStorage.getItem('userRole');
            if (typeof role !== 'string') return null;
            const limpo = role.trim();
            return /^[A-Za-z_-]{1,30}$/.test(limpo) ? limpo : null;
        } catch (e) {
            return null;
        }
    };
}

(function injetarEstilosDeFeedback() {
    if (document.getElementById('estilos-feedback')) return;
    const style = document.createElement('style');
    style.id = 'estilos-feedback';
    style.textContent = `
        #toast-container { position: fixed; top: 12px; right: 12px; left: 12px; z-index: 3000; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; pointer-events: none; }
        .toast { pointer-events: auto; width: 100%; max-width: 420px; display: flex; gap: 8px; align-items: flex-start; padding: 12px 14px; border-radius: 8px; color: #fff; font-size: 0.85rem; line-height: 1.35; cursor: pointer; border-left: 5px solid rgba(255,255,255,0.55); box-shadow: 0 6px 18px rgba(0,0,0,0.25); }
        .toast-sucesso { background: #16a34a; }
        .toast-erro { background: #dc3545; }
        .toast-aviso { background: #d97706; }
        .toast-info { background: #0ea5e9; }
        .estado-vazio { text-align: center; color: #64748b; padding: 14px; font-size: 0.85rem; }
        .estado-erro { text-align: center; color: #dc3545; padding: 14px; font-size: 0.85rem; grid-column: 1 / -1; }
        @media print { #toast-container { display: none !important; } }
    `;
    document.head.appendChild(style);
})();

// ============================================================
// CONFIGURAÇÃO
// ============================================================
const API_URL = "https://congelados-api.onrender.com";
const IMG_PADRAO = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300';
const CHAVE_CUSTOS = 'congelados_custos';
const TIMEOUT_REQUISICAO_MS = 60000;
const CUSTO_PADRAO_PERCENTUAL = 0.4;
const CUSTO_BI_PADRAO_PERCENTUAL = 0.5;
const MAX_FOTO_BYTES = 5 * 1024 * 1024;

const TITULOS_PAGINAS = {
    dashboard: 'Dashboard Analítico',
    produtos: 'Produtos & Estoque',
    clientes: 'Gestão de Clientes',
    pedidos: 'Registrar Pedido (PDV)',
    historico: 'Histórico de Vendas',
    financas: 'Finanças & Lucro',
    relatorios: 'Relatórios Gerenciais BI'
};
const PAGINAS_ADMIN = ['financas', 'relatorios'];

// ============================================================
// ESTADO GLOBAL
// ============================================================
let chartVendasInstance = null;
let chartEstoqueInstance = null;
let chartHistoricoInstance = null;
let chartComparativoInstance = null;

let produtosGlobais = [];
let clientesGlobais = [];
let pedidosGlobais = [];
let produtosPorId = new Map();
let clientesPorId = new Map();
let maisVendidosGlobais = null;
let dadosPorMes = {};

let dadosCarregados = false;
let carregando = false;
let recarregarPendente = false;
let tokenRelatorioBI = 0;

const operacoesEmAndamento = new Set();
const avisosExibidos = new Set();

// ============================================================
// UTILITÁRIOS GERAIS
// ============================================================
const $ = (id) => document.getElementById(id);

function definirTexto(id, texto) {
    const el = $(id);
    if (el) el.innerText = texto;
}

function definirHTML(id, html) {
    const el = $(id);
    if (el) el.innerHTML = html;
}

function definirValor(id, valor) {
    const el = $(id);
    if (el) el.value = valor ?? '';
}

const MAPA_HTML = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, (c) => MAPA_HTML[c]);
}

function textoSeguro(valor, padrao = '') {
    if (valor === null || valor === undefined) return padrao;
    const texto = String(valor).trim();
    return texto || padrao;
}

function paraNumero(valor, padrao = 0) {
    if (valor === null || valor === undefined || valor === '') return padrao;
    const n = typeof valor === 'number' ? valor : parseFloat(valor);
    return Number.isFinite(n) ? n : padrao;
}

function formatarMoeda(valor) {
    return `R$ ${paraNumero(valor).toFixed(2)}`;
}

function parseData(valor) {
    if (!valor) return null;
    const d = new Date(valor);
    return Number.isNaN(d.getTime()) ? null : d;
}

function formatarData(valor, padrao = '-') {
    const d = parseData(valor);
    return d ? d.toLocaleDateString('pt-BR') : padrao;
}

function formatarDataHora(valor, padrao = 'N/A') {
    const d = parseData(valor);
    return d ? d.toLocaleString('pt-BR') : padrao;
}

function indexarPorId(lista) {
    return new Map(lista.map((item) => [item.id, item]));
}

// ============================================================
// FEEDBACK VISUAL (TOASTS)
// ============================================================
function mostrarMensagem(texto, tipo = 'info', duracaoMs) {
    try {
        let container = $('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.setAttribute('role', 'status');
            container.setAttribute('aria-live', 'polite');
            document.body.appendChild(container);
        }
        while (container.children.length >= 4) container.removeChild(container.firstChild);

        const icones = { sucesso: '✅', erro: '❌', aviso: '⚠️', info: 'ℹ️' };
        const toast = document.createElement('div');
        toast.className = `toast toast-${icones[tipo] ? tipo : 'info'}`;

        const icone = document.createElement('span');
        icone.textContent = icones[tipo] ?? icones.info;
        const msg = document.createElement('span');
        msg.textContent = String(texto ?? '');
        toast.append(icone, msg);

        const remover = () => toast.remove();
        toast.addEventListener('click', remover);
        container.appendChild(toast);
        setTimeout(remover, duracaoMs ?? (tipo === 'erro' ? 8000 : 4500));
    } catch (e) {
        console.error('Falha ao exibir mensagem:', e);
        alert(String(texto ?? ''));
    }
}

function avisarUmaVez(chave, texto, tipo = 'aviso') {
    if (avisosExibidos.has(chave)) return;
    avisosExibidos.add(chave);
    mostrarMensagem(texto, tipo);
}

function tratarErro(err, contexto) {
    console.error(`${contexto}:`, err);
    const detalhe = err instanceof ErroApi
        ? err.message
        : 'Ocorreu um erro inesperado. Tente novamente.';
    mostrarMensagem(`${contexto}. ${detalhe}`, 'erro');
}

window.addEventListener('unhandledrejection', (event) => {
    console.error('Promise rejeitada sem tratamento:', event.reason);
    avisarUmaVez('unhandled', 'Ocorreu um erro inesperado. Se o problema persistir, recarregue a página.', 'erro');
});

// ============================================================
// REQUISIÇÕES À API
// ============================================================
class ErroApi extends Error {
    constructor(mensagem, status = null) {
        super(mensagem);
        this.name = 'ErroApi';
        this.status = status;
    }
}

async function extrairMensagemErro(res) {
    try {
        const dados = await res.json();
        const detalhe = dados?.detail ?? dados?.message ?? dados?.erro;
        if (typeof detalhe === 'string' && detalhe.trim()) return detalhe;
        if (Array.isArray(detalhe)) {
            const msgs = detalhe.map((d) => d?.msg).filter(Boolean);
            if (msgs.length) return msgs.join('; ');
        }
    } catch (_) { /* corpo sem JSON */ }
    if (res.status === 404) return 'Registro não encontrado.';
    if (res.status >= 500) return 'Erro interno no servidor. Tente novamente em instantes.';
    return `O servidor retornou um erro (${res.status}).`;
}

async function requisitar(url, opcoes = {}, { timeout = TIMEOUT_REQUISICAO_MS, json = true } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    let res;
    try {
        res = await fetch(url, { ...opcoes, signal: controller.signal });
    } catch (e) {
        if (e?.name === 'AbortError') {
            throw new ErroApi('O servidor demorou demais para responder. Tente novamente.');
        }
        throw new ErroApi('Não foi possível conectar ao servidor. Verifique sua conexão com a internet.');
    } finally {
        clearTimeout(timer);
    }

    if (!res.ok) throw new ErroApi(await extrairMensagemErro(res), res.status);
    if (!json || res.status === 204) return null;

    const texto = await res.text();
    if (!texto) return null;
    try {
        return JSON.parse(texto);
    } catch (_) {
        throw new ErroApi('O servidor enviou uma resposta inválida.');
    }
}

const CABECALHO_JSON = { 'Content-Type': 'application/json' };

async function executarUmaVez(chave, fn) {
    if (operacoesEmAndamento.has(chave)) return;
    operacoesEmAndamento.add(chave);
    try {
        return await fn();
    } finally {
        operacoesEmAndamento.delete(chave);
    }
}

// ============================================================
// NORMALIZAÇÃO DOS DADOS DA API
// ============================================================
function normalizarProduto(p) {
    if (!p || typeof p !== 'object') return null;
    const id = Number(p.id);
    if (!Number.isFinite(id)) return null;
    return {
        id,
        nome: textoSeguro(p.nome, 'Produto sem nome'),
        preco: Math.max(0, paraNumero(p.preco)),
        estoque: Math.trunc(paraNumero(p.estoque)),
        foto: typeof p.foto === 'string' ? p.foto.trim() : '',
        preco_custo: paraNumero(p.preco_custo, null)
    };
}

function normalizarCliente(c) {
    if (!c || typeof c !== 'object') return null;
    const id = Number(c.id);
    if (!Number.isFinite(id)) return null;
    return {
        id,
        nome: textoSeguro(c.nome, 'Cliente sem nome'),
        cnpj: textoSeguro(c.cnpj),
        telefone: textoSeguro(c.telefone),
        cidade: textoSeguro(c.cidade),
        endereco: textoSeguro(c.endereco),
        observacao: textoSeguro(c.observacao)
    };
}

function normalizarItemPedido(item) {
    if (!item || typeof item !== 'object') return null;
    const produtoId = Number(item.produto_id);
    return {
        produto_id: Number.isFinite(produtoId) ? produtoId : null,
        quantidade: Math.max(0, Math.trunc(paraNumero(item.quantidade))),
        preco_venda: (paraNumero(item.preco_venda, 0) > 0) ? paraNumero(item.preco_venda, 0) : null
    };
}

function normalizarPedido(p) {
    if (!p || typeof p !== 'object') return null;
    const id = Number(p.id);
    if (!Number.isFinite(id)) return null;
    const clienteId = Number(p.cliente_id);
    return {
        id,
        cliente_id: p.cliente_id === null || p.cliente_id === undefined || !Number.isFinite(clienteId) ? null : clienteId,
        data_criacao: p.data_criacao ?? null,
        status: textoSeguro(p.status, 'Concluído'),
        itens: (Array.isArray(p.itens) ? p.itens : []).map(normalizarItemPedido).filter(Boolean)
    };
}

function normalizarMaisVendido(m) {
    if (!m || typeof m !== 'object') return null;
    return {
        produto: textoSeguro(m.produto, 'Sem nome'),
        quantidade_vendida: paraNumero(m.quantidade_vendida),
        total_em_reais: paraNumero(m.total_em_reais)
    };
}

function normalizarLista(dados, normalizador) {
    if (!Array.isArray(dados)) throw new ErroApi('O servidor enviou os dados em um formato inesperado.');
    return dados.map(normalizador).filter(Boolean);
}

function precoDoItem(item, produto) {
    return item.preco_venda ?? produto?.preco ?? 0;
}

// ============================================================
// CUSTOS (localStorage)
// ============================================================
function salvarCustos(custos) {
    try {
        localStorage.setItem(CHAVE_CUSTOS, JSON.stringify(custos));
        return true;
    } catch (e) {
        console.warn('Não foi possível salvar os custos:', e);
        avisarUmaVez('storage', 'Não foi possível salvar os custos neste navegador.');
        return false;
    }
}

function carregarCustos() {
    let bruto = null;
    try {
        bruto = localStorage.getItem(CHAVE_CUSTOS);
    } catch (e) {
        return {};
    }
    if (bruto === null) return {};

    try {
        const lido = JSON.parse(bruto);
        if (!lido || typeof lido !== 'object' || Array.isArray(lido)) throw new Error('formato inválido');

        const limpo = {};
        Object.entries(lido).forEach(([chave, valor]) => {
            const n = typeof valor === 'number' ? valor : Number(valor);
            if (/^\d+$/.test(chave) && Number.isFinite(n) && n >= 0) limpo[chave] = n;
        });
        return limpo;
    } catch (e) {
        try { localStorage.removeItem(CHAVE_CUSTOS); } catch (_) {}
        return {};
    }
}

let custosProdutos = carregarCustos();

function custoUnitario(produto) {
    const custo = custosProdutos[produto.id];
    return Number.isFinite(custo) ? custo : produto.preco * CUSTO_PADRAO_PERCENTUAL;
}

// ============================================================
// PERMISSÕES
// ============================================================
function aplicarPermissoes() {
    if (obterRole() !== 'admin') {
        document.querySelectorAll('.menu-admin-only').forEach((el) => { el.style.display = 'none'; });
    }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', aplicarPermissoes);
else aplicarPermissoes();

// ============================================================
// GRÁFICOS
// ============================================================
function desenharGrafico(canvasId, anterior, config) {
    if (anterior) {
        try { anterior.destroy(); } catch (_) {}
    }
    if (typeof Chart === 'undefined') return null;
    const canvas = $(canvasId);
    if (!canvas) return null;
    try {
        return new Chart(canvas.getContext('2d'), config);
    } catch (e) {
        return null;
    }
}

// ============================================================
// NAVEGAÇÃO
// ============================================================
function toggleSidebar() {
    $('sidebar')?.classList.toggle('open');
    $('sidebarOverlay')?.classList.toggle('active');
}

function mudarPagina(paginaId) {
    const titulo = TITULOS_PAGINAS[paginaId];
    if (typeof titulo !== 'string') return;

    if (PAGINAS_ADMIN.includes(paginaId) && obterRole() !== 'admin') {
        mostrarMensagem('Você não tem permissão para acessar esta área.', 'aviso');
        return;
    }

    const pagina = $(`page-${paginaId}`);
    if (!pagina) return;

    document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
    document.querySelectorAll('.sidebar-menu li').forEach((m) => m.classList.remove('active'));

    pagina.classList.add('active');
    $(`menu-${paginaId}`)?.classList.add('active');
    definirTexto('page-title', titulo);

    $('sidebar')?.classList.remove('open');
    $('sidebarOverlay')?.classList.remove('active');

    if (paginaId === 'dashboard') atualizarGraficosDashboard();
    if (paginaId === 'historico') carregarHistoricoVendas();
    if (paginaId === 'relatorios') {
        atualizarRelatoriosBI();
        processarRelatoriosMensais();
        atualizarGraficoComparativo();
        popularSelectClientesHistorico();
    }
}

// ============================================================
// PRODUTOS
// ============================================================
function converterImagem(event) {
    const input = event?.target;
    const file = input?.files?.[0];
    if (!file) return;

    if (!file.type || !file.type.startsWith('image/')) {
        mostrarMensagem('Selecione um arquivo de imagem válido.', 'aviso');
        input.value = '';
        return;
    }
    if (file.size > MAX_FOTO_BYTES) {
        mostrarMensagem('A imagem é muito grande (máx. 5 MB).', 'aviso');
        input.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const resultado = e.target?.result;
        if (typeof resultado !== 'string') return;
        definirValor('prodFotoBase64', resultado);
        const preview = $('previewFoto');
        if (preview) {
            preview.src = resultado;
            preview.style.display = 'block';
        }
    };
    reader.readAsDataURL(file);
}

async function salvarProduto() {
    return executarUmaVez('salvarProduto', async () => {
        const id = textoSeguro($('prodEditId')?.value);
        const nome = textoSeguro($('prodNome')?.value);
        const preco = parseFloat($('prodPreco')?.value);
        const estoque = parseInt($('prodEstoque')?.value, 10);
        const foto = $('prodFotoBase64')?.value ?? '';

        if (!nome || !Number.isFinite(preco) || !Number.isFinite(estoque)) {
            return mostrarMensagem('Preencha os campos obrigatórios.', 'aviso');
        }

        try {
            await requisitar(
                id ? `${API_URL}/produtos/${encodeURIComponent(id)}` : `${API_URL}/produtos/`,
                { method: id ? 'PUT' : 'POST', headers: CABECALHO_JSON, body: JSON.stringify({ nome, preco, estoque, foto }) },
                { json: false }
            );
            mostrarMensagem(id ? 'Produto atualizado!' : 'Produto cadastrado!', 'sucesso');
            limparFormularioProduto();
            await carregarDados();
        } catch (err) {
            tratarErro(err, 'Não foi possível salvar o produto');
        }
    });
}

function prepararEdicaoProduto(id) {
    const p = produtosPorId.get(Number(id));
    if (!p) return mostrarMensagem('Produto não encontrado.', 'aviso');
    definirValor('prodEditId', p.id);
    definirValor('prodNome', p.nome);
    definirValor('prodPreco', p.preco);
    definirValor('prodEstoque', p.estoque);
    definirValor('prodFotoBase64', p.foto);

    const preview = $('previewFoto');
    if (preview) {
        if (p.foto) { preview.src = p.foto; preview.style.display = 'block'; }
        else { preview.removeAttribute('src'); preview.style.display = 'none'; }
    }
    definirTexto('formProdutoTitulo', 'Editar Produto');
    const btn = $('btnCancelarProd');
    if (btn) btn.style.display = 'inline-block';
    mudarPagina('produtos');
}

function limparFormularioProduto() {
    ['prodEditId', 'prodNome', 'prodPreco', 'prodEstoque', 'prodFotoFile', 'prodFotoBase64'].forEach((id) => definirValor(id, ''));
    const preview = $('previewFoto');
    if (preview) { preview.removeAttribute('src'); preview.style.display = 'none'; }
    definirTexto('formProdutoTitulo', 'Cadastrar Novo Produto');
    const btn = $('btnCancelarProd');
    if (btn) btn.style.display = 'none';
}

// ============================================================
// CLIENTES
// ============================================================
async function salvarCliente() {
    return executarUmaVez('salvarCliente', async () => {
        const id = textoSeguro($('cliEditId')?.value);
        const payload = {
            nome: textoSeguro($('cliNome')?.value),
            cnpj: textoSeguro($('cliCnpj')?.value),
            telefone: textoSeguro($('cliTelefone')?.value),
            cidade: textoSeguro($('cliCidade')?.value),
            endereco: textoSeguro($('cliEndereco')?.value),
            observacao: textoSeguro($('cliObs')?.value)
        };
        if (!payload.nome) return mostrarMensagem('Preencha o nome do cliente.', 'aviso');

        try {
            await requisitar(
                id ? `${API_URL}/clientes/${encodeURIComponent(id)}` : `${API_URL}/clientes/`,
                { method: id ? 'PUT' : 'POST', headers: CABECALHO_JSON, body: JSON.stringify(payload) },
                { json: false }
            );
            mostrarMensagem('Cliente salvo com sucesso!', 'sucesso');
            limparFormularioCliente();
            await carregarDados();
        } catch (err) {
            tratarErro(err, 'Não foi possível salvar o cliente');
        }
    });
}

function prepararEdicaoCliente(id) {
    const c = clientesPorId.get(Number(id));
    if (!c) return mostrarMensagem('Cliente não encontrado.', 'aviso');
    definirValor('cliEditId', c.id);
    definirValor('cliNome', c.nome);
    definirValor('cliCnpj', c.cnpj);
    definirValor('cliTelefone', c.telefone);
    definirValor('cliCidade', c.cidade);
    definirValor('cliEndereco', c.endereco);
    definirValor('cliObs', c.observacao);
    definirTexto('formClienteTitulo', 'Editar Cliente');
    const btn = $('btnCancelarCli');
    if (btn) btn.style.display = 'inline-block';
    mudarPagina('clientes');
}

function limparFormularioCliente() {
    ['cliEditId', 'cliNome', 'cliCnpj', 'cliTelefone', 'cliCidade', 'cliEndereco', 'cliObs'].forEach((id) => definirValor(id, ''));
    definirTexto('formClienteTitulo', 'Cadastrar Novo Cliente');
    const btn = $('btnCancelarCli');
    if (btn) btn.style.display = 'none';
}

function abrirWhatsApp(clienteId) {
    const cliente = clientesPorId.get(Number(clienteId));
    const telefone = textoSeguro(cliente?.telefone);
    if (!telefone) return mostrarMensagem('Este cliente não possui telefone!', 'aviso');
    let numeroLimpo = telefone.replace(/\D/g, '');
    if (numeroLimpo.length <= 11) numeroLimpo = '55' + numeroLimpo;
    const mensagem = encodeURIComponent(`Olá ${cliente.nome}, aqui está o recibo dos seus produtos congelados! 🧊`);
    window.open(`https://wa.me/${numeroLimpo}?text=${mensagem}`, '_blank', 'noopener');
}

// ============================================================
// FINANÇAS
// ============================================================
function atualizarCustoProduto(prodId, precoVenda) {
    const input = $(`custo_${prodId}`);
    if (!input) return;
    const produto = produtosPorId.get(Number(prodId));
    const preco = paraNumero(precoVenda, produto?.preco ?? 0);
    const custo = Math.max(0, paraNumero(input.value, 0));

    custosProdutos[String(prodId)] = custo;
    salvarCustos(custosProdutos);

    const lucroUnit = preco - custo;
    const margem = preco > 0 ? ((lucroUnit / preco) * 100).toFixed(1) : '0.0';
    definirTexto(`lucro_${prodId}`, formatarMoeda(lucroUnit));
    definirTexto(`margem_${prodId}`, `${margem}%`);
}

// ============================================================
// PDV / PEDIDOS
// ============================================================
function selecionarProdutoPDV(id, elemento) {
    const p = produtosPorId.get(Number(id));
    if (!p) return mostrarMensagem('Produto não encontrado.', 'aviso');
    definirValor('pedidoProdutoId', p.id);
    definirValor('pdvProdutoSelecionadoNome', `${p.nome} (R$ ${p.preco.toFixed(2)})`);
    document.querySelectorAll('.pdv-product-card').forEach((card) => card.classList.remove('selected'));
    elemento?.classList?.add('selected');
    atualizarTotalPDV();
}

function atualizarTotalPDV() {
    const prodId = $('pedidoProdutoId')?.value;
    const qtd = parseInt($('pedidoQtd')?.value, 10) || 1;
    const produto = prodId ? produtosPorId.get(Number(prodId)) : null;
    definirTexto('pdvTotalPreco', produto ? `R$ ${(produto.preco * qtd).toFixed(2)}` : 'R$ 0,00');
}

async function criarPedido() {
    return executarUmaVez('criarPedido', async () => {
        const clienteId = parseInt($('pedidoCliente')?.value, 10);
        const produtoId = parseInt($('pedidoProdutoId')?.value, 10);
        const quantidade = parseInt($('pedidoQtd')?.value, 10) || 1;

        if (!Number.isFinite(clienteId) || !Number.isFinite(produtoId)) {
            return mostrarMensagem('Selecione um cliente e um produto.', 'aviso');
        }
        if (quantidade < 1) {
            return mostrarMensagem('Informe uma quantidade válida.', 'aviso');
        }

        const produto = produtosPorId.get(produtoId);
        const precoVenda = produto ? produto.preco : 0;

        mostrarMensagem('Registrando venda...', 'info', 2500);
        try {
            const resposta = await fetch(`${API_URL}/pedidos/`, {
                method: 'POST',
                headers: CABECALHO_JSON,
                body: JSON.stringify({
                    cliente_id: clienteId,
                    itens: [{
                        produto_id: produtoId,
                        quantidade: quantidade,
                        preco_venda: precoVenda
                    }]
                })
            });

            if (!resposta.ok) {
                let erroMsg = 'Erro ao processar venda no servidor.';
                try {
                    const errJson = await resposta.json();
                    if (errJson?.detail) erroMsg = errJson.detail;
                } catch (_) {}
                throw new Error(erroMsg);
            }

            mostrarMensagem('Pedido realizado com sucesso!', 'sucesso');
            definirValor('pedidoProdutoId', '');
            definirValor('pdvProdutoSelecionadoNome', 'Nenhum selecionado');
            definirValor('pedidoQtd', 1);
            definirTexto('pdvTotalPreco', 'R$ 0,00');
            document.querySelectorAll('.pdv-product-card').forEach((card) => card.classList.remove('selected'));
            await carregarDados();
        } catch (err) {
            tratarErro(err, 'Erro ao registrar o pedido');
        }
    });
}

// ============================================================
// RENDERIZAÇÃO
// ============================================================
function linhaMensagem(colspan, texto, classe = 'estado-vazio') {
    return `<tr><td colspan="${colspan}" class="${classe}">${esc(texto)}</td></tr>`;
}

function renderizarCatalogo() {
    const el = $('catalogoProdutos');
    if (!el) return;
    if (!produtosGlobais.length) {
        el.innerHTML = '<div class="estado-vazio" style="grid-column:1/-1;">Nenhum produto cadastrado.</div>';
        return;
    }
    el.innerHTML = produtosGlobais.map((p) => {
        const img = p.foto || IMG_PADRAO;
        return `<div class="product-card">
            <img src="${esc(img)}" class="product-img" alt="${esc(p.nome)}" loading="lazy" onerror="this.onerror=null;this.src=IMG_PADRAO">
            <div class="product-info">
                <div>
                    <h4 style="margin:0 0 4px 0;font-size:0.85rem;">${esc(p.nome)}</h4>
                    <p style="margin:0;color:#64748b;font-size:0.75rem;">R$ ${p.preco.toFixed(2)} | Est: <strong>${p.estoque}</strong></p>
                </div>
                <div style="margin-top:6px;display:flex;gap:4px;">
                    <button class="btn-editar" onclick="prepararEdicaoProduto(${p.id})">Editar</button>
                    <button class="btn-excluir" onclick="excluirProduto(${p.id})">Excluir</button>
                </div>
            </div>
        </div>`;
    }).join('');
}

function renderizarPDV() {
    const el = $('pdvListaProdutos');
    if (!el) return;
    if (!produtosGlobais.length) {
        el.innerHTML = '<div class="estado-vazio">Nenhum produto disponível.</div>';
        definirValor('pedidoProdutoId', '');
        return;
    }
    el.innerHTML = produtosGlobais.map((p) => {
        const img = p.foto || IMG_PADRAO;
        return `<div class="pdv-product-card" data-id="${p.id}" onclick="selecionarProdutoPDV(${p.id}, this)">
            <img src="${esc(img)}" class="pdv-img" alt="" loading="lazy" onerror="this.onerror=null;this.src=IMG_PADRAO">
            <div style="flex:1; min-width:0;">
                <h4 style="margin:0 0 2px 0;font-size:0.85rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(p.nome)}</h4>
                <p style="margin:0;font-size:0.75rem;color:#64748b;">R$ ${p.preco.toFixed(2)} | Est: ${p.estoque}</p>
            </div>
        </div>`;
    }).join('');

    const selecionadoId = $('pedidoProdutoId')?.value;
    if (selecionadoId) {
        const card = el.querySelector(`.pdv-product-card[data-id="${CSS.escape(String(selecionadoId))}"]`);
        if (card) card.classList.add('selected');
        atualizarTotalPDV();
    }
}

function renderizarFinancas() {
    const el = $('tabelaFinancasLucro');
    if (!el) return;
    if (!produtosGlobais.length) {
        el.innerHTML = linhaMensagem(6, 'Nenhum produto cadastrado.');
        return;
    }
    el.innerHTML = produtosGlobais.map((p) => {
        const img = p.foto || IMG_PADRAO;
        const custo = custoUnitario(p);
        const lucroUnit = p.preco - custo;
        const margem = p.preco > 0 ? ((lucroUnit / p.preco) * 100).toFixed(1) : '0.0';
        return `<tr>
            <td><img src="${esc(img)}" alt="" style="width:30px;height:30px;object-fit:cover;border-radius:4px;" onerror="this.onerror=null;this.src=IMG_PADRAO"></td>
            <td style="font-weight:bold;">${esc(p.nome)}</td>
            <td><input type="number" step="0.01" min="0" id="custo_${p.id}" value="${custo.toFixed(2)}" oninput="atualizarCustoProduto(${p.id}, ${p.preco})" style="width:65px;padding:4px;font-size:0.8rem;"></td>
            <td>R$ ${p.preco.toFixed(2)}</td>
            <td id="lucro_${p.id}" style="color:var(--success);font-weight:bold;">R$ ${lucroUnit.toFixed(2)}</td>
            <td id="margem_${p.id}" style="font-weight:bold;">${margem}%</td>
        </tr>`;
    }).join('');
}

function renderizarClientes() {
    const tabela = $('tabelaClientes');
    const select = $('pedidoCliente');

    if (tabela) {
        tabela.innerHTML = clientesGlobais.length
            ? clientesGlobais.map((c) => `<tr>
                <td>${c.id}</td>
                <td style="font-weight:bold;">${esc(c.nome)}</td>
                <td>${esc(c.cnpj || '-')}</td>
                <td>${esc(c.telefone || '-')}</td>
                <td>${esc(c.cidade || '-')}</td>
                <td>${esc(c.endereco || '-')}</td>
                <td>${esc(c.observacao || '-')}</td>
                <td>
                    <button class="btn-editar" onclick="prepararEdicaoCliente(${c.id})">Editar</button>
                    <button class="btn-excluir" onclick="excluirCliente(${c.id})">Excluir</button>
                    <button onclick="abrirWhatsApp(${c.id})" style="background-color: #25D366; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 0.75rem;" title="Abrir WhatsApp">💬 Wpp</button>
                </td>
            </tr>`).join('')
            : linhaMensagem(8, 'Nenhum cliente cadastrado.');
    }

    if (select) {
        select.innerHTML = '<option value="">Selecione...</option>' +
            clientesGlobais.map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join('');
    }
}

function renderizarRelatorioLucroTotal(maisVendidos) {
    const el = $('tabelaRelatorioLucroTotal');
    if (!el) return;
    if (!maisVendidos.length) {
        el.innerHTML = linhaMensagem(4, 'Nenhuma venda registrada.');
        return;
    }
    const produtosPorNome = new Map(produtosGlobais.map((p) => [p.nome, p]));
    el.innerHTML = maisVendidos.map((m) => {
        const prod = produtosPorNome.get(m.produto);
        const custoUnit = prod ? custoUnitario(prod) : 0;
        const lucroTotal = m.total_em_reais - (custoUnit * m.quantidade_vendida);
        return `<tr>
            <td>${esc(m.produto)}</td>
            <td>${m.quantidade_vendida} un</td>
            <td>R$ ${m.total_em_reais.toFixed(2)}</td>
            <td style="color:var(--success);font-weight:bold;">R$ ${lucroTotal.toFixed(2)}</td>
        </tr>`;
    }).join('');
}

// ============================================================
// CARREGAMENTO PRINCIPAL
// ============================================================
async function obterMaisVendidos(forcar = false) {
    if (!forcar && Array.isArray(maisVendidosGlobais)) return maisVendidosGlobais;
    const dados = await requisitar(`${API_URL}/relatorios/produtos-mais-vendidos`);
    maisVendidosGlobais = normalizarLista(dados, normalizarMaisVendido);
    return maisVendidosGlobais;
}

async function carregarDados() {
    if (carregando) { recarregarPendente = true; return; }
    carregando = true;
    try {
        await carregarDadosInterno();
    } finally {
        carregando = false;
        if (recarregarPendente) {
            recarregarPendente = false;
            carregarDados();
        }
    }
}

async function carregarDadosInterno() {
    try {
        const [resProd, resCli, resPed] = await Promise.all([
            requisitar(`${API_URL}/produtos/`),
            requisitar(`${API_URL}/clientes/`),
            requisitar(`${API_URL}/pedidos/`)
        ]);
        produtosGlobais = normalizarLista(resProd, normalizarProduto);
        clientesGlobais = normalizarLista(resCli, normalizarCliente);
        pedidosGlobais = normalizarLista(resPed, normalizarPedido);
        produtosPorId = indexarPorId(produtosGlobais);
        clientesPorId = indexarPorId(clientesGlobais);
        dadosCarregados = true;
    } catch (err) {
        tratarErro(err, 'Não foi possível carregar os dados do sistema');
        return;
    }

    renderizarCatalogo();
    renderizarPDV();
    renderizarFinancas();
    renderizarClientes();

    const valorEstoque = produtosGlobais.reduce((soma, p) => soma + (p.preco * p.estoque), 0);
    definirTexto('statTotalProdutos', produtosGlobais.length);
    definirTexto('statValorEstoque', `R$ ${valorEstoque.toFixed(2)}`);
    definirTexto('statTotalClientes', clientesGlobais.length);

    try {
        const maisVendidos = await obterMaisVendidos(true);
        renderizarRelatorioLucroTotal(maisVendidos);
    } catch (_) {}

    atualizarGraficosDashboard();
    carregarHistoricoVendas();
    atualizarRelatoriosBI(true);
}

window.addEventListener('load', carregarDados);

// ============================================================
// GRÁFICOS E BI
// ============================================================
async function atualizarGraficosDashboard() {
    try {
        const maisVendidos = await obterMaisVendidos();
        chartVendasInstance = desenharGrafico('graficoVendas', chartVendasInstance, {
            type: 'bar',
            data: {
                labels: maisVendidos.map((m) => m.produto),
                datasets: [{ label: 'Qtd', data: maisVendidos.map((m) => m.quantidade_vendida), backgroundColor: '#ea580c', borderRadius: 4 }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    } catch (_) {}

    chartEstoqueInstance = desenharGrafico('graficoEstoque', chartEstoqueInstance, {
        type: 'doughnut',
        data: {
            labels: produtosGlobais.map((p) => p.nome),
            datasets: [{ data: produtosGlobais.map((p) => p.estoque), backgroundColor: ['#ea580c', '#0ea5e9', '#16a34a', '#eab308', '#6366f1'] }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

async function atualizarGraficoComparativo() {
    try {
        const maisVendidos = await obterMaisVendidos();
        const produtosPorNome = new Map(produtosGlobais.map((p) => [p.nome, p]));

        const labels = [];
        const faturamentos = [];
        const lucrosTotais = [];

        maisVendidos.forEach((m) => {
            labels.push(m.produto);
            faturamentos.push(m.total_em_reais);

            const prod = produtosPorNome.get(m.produto);
            const custoUnit = prod ? custoUnitario(prod) : 0;
            const lucroUnit = (prod ? prod.preco : 0) - custoUnit;
            lucrosTotais.push(lucroUnit * m.quantidade_vendida);
        });

        chartComparativoInstance = desenharGrafico('graficoComparativoLucro', chartComparativoInstance, {
            type: 'bar',
            data: {
                labels: labels.length ? labels : ['Sem Dados'],
                datasets: [
                    { label: 'Faturamento (R$)', data: faturamentos, backgroundColor: '#0ea5e9', borderRadius: 4 },
                    { label: 'Lucro (R$)', data: lucrosTotais, backgroundColor: '#16a34a', borderRadius: 4 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    } catch (_) {}
}

function processarRelatoriosMensais() {
    try {
        dadosPorMes = {};
        pedidosGlobais.forEach((ped) => {
            const data = parseData(ped.data_criacao);
            if (!data) return;
            const chave = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;

            if (!dadosPorMes[chave]) dadosPorMes[chave] = { totalFaturado: 0, totalLucro: 0, clientes: {} };
            const registro = dadosPorMes[chave];

            let faturamentoPed = 0;
            let lucroPed = 0;
            ped.itens.forEach((item) => {
                const prod = produtosPorId.get(item.produto_id);
                const precoVenda = precoDoItem(item, prod);
                const custoUnit = prod ? custoUnitario(prod) : 0;
                faturamentoPed += item.quantidade * precoVenda;
                lucroPed += (precoVenda - custoUnit) * item.quantidade;
            });

            registro.totalFaturado += faturamentoPed;
            registro.totalLucro += lucroPed;
            const chaveCliente = String(ped.cliente_id ?? 'removido');
            registro.clientes[chaveCliente] = (registro.clientes[chaveCliente] ?? 0) + faturamentoPed;
        });

        const mesesLabels = Object.keys(dadosPorMes).sort();
        const faturamentos = mesesLabels.map((mes) => dadosPorMes[mes].totalFaturado);

        chartHistoricoInstance = desenharGrafico('graficoHistoricoMeses', chartHistoricoInstance, {
            type: 'bar',
            data: {
                labels: mesesLabels.length ? mesesLabels.map((m) => { const [ano, mes] = m.split('-'); return `${mes}/${ano}`; }) : ['Sem Vendas'],
                datasets: [{ label: 'Faturamento (R$)', data: faturamentos, backgroundColor: '#0ea5e9', borderRadius: 4 }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });

        const selectMes = $('selectFiltroMes');
        if (selectMes) {
            selectMes.innerHTML = mesesLabels.map((mes) => {
                const [ano, m] = mes.split('-');
                return `<option value="${esc(mes)}">${esc(`${m}/${ano}`)}</option>`;
            }).join('');
        }

        if (mesesLabels.length > 0) {
            if (selectMes) selectMes.value = mesesLabels[mesesLabels.length - 1];
            atualizarTabelaMes();
        }
    } catch (_) {}
}

function atualizarTabelaMes() {
    try {
        const mesSelecionado = $('selectFiltroMes')?.value;
        const dados = dadosPorMes[mesSelecionado];
        if (!dados) return;

        definirTexto('totalFaturadoMes', formatarMoeda(dados.totalFaturado));
        definirTexto('totalLucroMes', formatarMoeda(dados.totalLucro));

        const ranking = Object.entries(dados.clientes).map(([cliId, total]) => ({
            nome: clientesPorId.get(Number(cliId))?.nome ?? 'Cliente removido',
            total
        })).sort((a, b) => b.total - a.total);

        const medalhas = ['🥇', '🥈', '🥉'];
        definirHTML('tabelaRankingClientesMes', ranking.length
            ? ranking.map((cli, index) => `<tr>
                <td style="font-weight:bold;">${medalhas[index] ?? `${index + 1}º`}</td>
                <td>${esc(cli.nome)}</td>
                <td style="font-weight:bold; color:var(--primary);">R$ ${cli.total.toFixed(2)}</td>
            </tr>`).join('')
            : linhaMensagem(3, 'Nenhuma venda.'));
    } catch (_) {}
}

function popularSelectClientesHistorico() {
    const select = $('selectHistoricoCliente');
    if (!select) return;
    select.innerHTML = '<option value="">Selecione um cliente...</option>' +
        clientesGlobais.map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join('');
}

function atualizarHistoricoCliente() {
    try {
        const clienteId = $('selectHistoricoCliente')?.value;
        const semSelecao = !clienteId;
        const pedidosCliente = semSelecao ? [] : pedidosGlobais.filter((p) => String(p.cliente_id) === String(clienteId));

        if (semSelecao || pedidosCliente.length === 0) {
            definirTexto('clienteTotalGasto', 'R$ 0,00');
            definirTexto('clienteTotalPedidos', '0');
            definirHTML('tabelaHistoricoClienteDetalhado', linhaMensagem(5, semSelecao ? 'Nenhum cliente selecionado.' : 'Nenhuma compra registrada.'));
            return;
        }

        let totalGastoGeral = 0;
        const linhas = pedidosCliente.map((ped) => {
            let totalPedido = 0;
            const itensDesc = ped.itens.map((item) => {
                const prod = produtosPorId.get(item.produto_id);
                totalPedido += item.quantidade * precoDoItem(item, prod);
                return `${item.quantidade}x ${prod?.nome ?? `Produto`}`;
            });
            totalGastoGeral += totalPedido;

            return `<tr>
                <td style="font-weight:bold;">#${ped.id}</td>
                <td>${esc(formatarData(ped.data_criacao))}</td>
                <td>${esc(itensDesc.join(', ') || 'Sem itens')}</td>
                <td style="font-weight:bold; color:var(--success);">R$ ${totalPedido.toFixed(2)}</td>
                <td>
                    <button class="btn-editar" onclick="gerarReciboPDF(${ped.id})">📄 PDF</button>
                    <button class="btn-excluir" onclick="excluirPedido(${ped.id})">Excluir</button>
                </td>
            </tr>`;
        });

        definirHTML('tabelaHistoricoClienteDetalhado', linhas.join(''));
        definirTexto('clienteTotalGasto', formatarMoeda(totalGastoGeral));
        definirTexto('clienteTotalPedidos', pedidosCliente.length);
    } catch (_) {}
}

// ============================================================
// HISTÓRICO E RECIBOS
// ============================================================
function carregarHistoricoVendas() {
    const tbody = $('lista-historico-vendas');
    if (!tbody) return;

    try {
        if (!pedidosGlobais.length) {
            tbody.innerHTML = linhaMensagem(5, 'Nenhuma venda registrada.');
            return;
        }

        const ordenados = [...pedidosGlobais].sort((a, b) => {
            const dataA = parseData(a.data_criacao)?.getTime() ?? 0;
            const dataB = parseData(b.data_criacao)?.getTime() ?? 0;
            return dataB - dataA || b.id - a.id;
        });

        tbody.innerHTML = ordenados.map((pedido) => {
            const nomeCliente = clientesPorId.get(pedido.cliente_id)?.nome ?? 'Cliente Deletado';
            return `<tr>
                <td style="font-weight:bold;">#${pedido.id}</td>
                <td>${esc(formatarData(pedido.data_criacao))}</td>
                <td>${esc(nomeCliente)}</td>
                <td>${esc(pedido.status)}</td>
                <td><button class="btn-imprimir" onclick="gerarRecibo(${pedido.id})">🖨️ Recibo</button></td>
            </tr>`;
        }).join('');
    } catch (_) {
        tbody.innerHTML = linhaMensagem(5, 'Não foi possível exibir o histórico.', 'estado-erro');
    }
}

function gerarRecibo(pedidoId) {
    try {
        const pedido = pedidosGlobais.find((p) => p.id === Number(pedidoId));
        if (!pedido) return mostrarMensagem('Pedido não encontrado.', 'aviso');
        const cliente = clientesPorId.get(pedido.cliente_id);

        definirHTML('recibo-dados-cliente', `
            <strong>Cliente:</strong> ${esc(cliente?.nome ?? 'N/A')}<br>
            <strong>Telefone:</strong> ${esc(cliente?.telefone || 'N/A')}<br>
            <strong>Endereço:</strong> ${esc(cliente?.endereco || 'N/A')}<br>
            <strong>Data:</strong> ${esc(formatarDataHora(pedido.data_criacao))}
        `);

        let valorTotal = 0;
        const linhas = pedido.itens.map((item) => {
            const produto = produtosPorId.get(item.produto_id);
            const precoVenda = precoDoItem(item, produto);
            const subtotal = item.quantidade * precoVenda;
            valorTotal += subtotal;
            return `<tr>
                <td>${item.quantidade}x</td>
                <td>${esc(produto?.nome ?? 'Produto Excluído')}</td>
                <td>R$ ${precoVenda.toFixed(2)}</td>
                <td>R$ ${subtotal.toFixed(2)}</td>
            </tr>`;
        });

        definirHTML('recibo-itens', linhas.join('') || linhaMensagem(4, 'Pedido sem itens.'));
        definirTexto('recibo-total', `Total: R$ ${valorTotal.toFixed(2)}`);

        const reciboDiv = $('recibo-venda');
        if (!reciboDiv) return;
        reciboDiv.style.display = 'block';

        window.addEventListener('afterprint', () => { reciboDiv.style.display = 'none'; }, { once: true });
        setTimeout(() => { window.print(); }, 100);
    } catch (err) {
        tratarErro(err, 'Não foi possível gerar o recibo');
    }
}

async function gerarReciboPDF(pedidoId) {
    return executarUmaVez(`pdf_${pedidoId}`, async () => {
        const JsPDF = window.jspdf?.jsPDF;
        if (!JsPDF) return mostrarMensagem('A biblioteca de PDF não foi carregada.', 'erro');

        try {
            let pedido = pedidosGlobais.find((p) => p.id === Number(pedidoId));
            if (!pedido) {
                const lista = normalizarLista(await requisitar(`${API_URL}/pedidos/`), normalizarPedido);
                pedido = lista.find((p) => p.id === Number(pedidoId));
            }
            if (!pedido) return mostrarMensagem('Pedido não encontrado.', 'aviso');

            const clienteNome = clientesPorId.get(pedido.cliente_id)?.nome ?? 'Cliente';
            const doc = new JsPDF();

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(18);
            doc.text('Congelados & Cia', 105, 20, { align: 'center' });

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.text('Comprovante de Venda / Recibo', 105, 26, { align: 'center' });
            doc.line(14, 32, 196, 32);

            doc.setFontSize(11);
            doc.text(`Pedido Nº: #${pedido.id}`, 14, 42);
            doc.text(`Cliente: ${clienteNome}`, 14, 49);
            doc.text(`Data: ${formatarDataHora(pedido.data_criacao, 'N/A')}`, 14, 56);
            doc.line(14, 62, 196, 62);

            doc.setFont('helvetica', 'bold');
            doc.text('Qtd', 14, 70);
            doc.text('Produto', 30, 70);
            doc.text('Preço Unit.', 140, 70, { align: 'right' });
            doc.text('Subtotal', 190, 70, { align: 'right' });
            doc.line(14, 73, 196, 73);

            let y = 80;
            let totalGeral = 0;
            doc.setFont('helvetica', 'normal');

            pedido.itens.forEach((item) => {
                if (y > 275) { doc.addPage(); y = 20; }
                const prod = produtosPorId.get(item.produto_id);
                const nomeProd = prod?.nome ?? `Produto`;
                const precoVenda = precoDoItem(item, prod);
                const subtotal = item.quantidade * precoVenda;
                totalGeral += subtotal;

                doc.text(String(item.quantidade), 14, y);
                doc.text(nomeProd.slice(0, 55), 30, y);
                doc.text(`R$ ${precoVenda.toFixed(2)}`, 140, y, { align: 'right' });
                doc.text(`R$ ${subtotal.toFixed(2)}`, 190, y, { align: 'right' });
                y += 8;
            });

            doc.line(14, y + 2, 196, y + 2);
            doc.setFont('helvetica', 'bold');
            doc.text(`Total Geral: R$ ${totalGeral.toFixed(2)}`, 190, y + 10, { align: 'right' });

            doc.save(`recibo_pedido_${pedido.id}.pdf`);
            mostrarMensagem('Recibo em PDF gerado!', 'sucesso');
        } catch (err) {
            tratarErro(err, 'Erro ao gerar PDF');
        }
    });
}

// ============================================================
// RELATÓRIOS BI
// ============================================================
async function atualizarRelatoriosBI(usarCache = false) {
    const filtro = $('filtro-mes');
    if (!filtro) return;

    const mesSelecionado = filtro.value;
    const meuToken = ++tokenRelatorioBI;

    try {
        let pedidos, clientes, produtos;
        if (usarCache === true && dadosCarregados) {
            ({ pedidos, clientes, produtos } = { pedidos: pedidosGlobais, clientes: clientesGlobais, produtos: produtosGlobais });
        } else {
            const [resPedidos, resClientes, resProdutos] = await Promise.all([
                requisitar(`${API_URL}/pedidos/`),
                requisitar(`${API_URL}/clientes/`),
                requisitar(`${API_URL}/produtos/`)
            ]);
            pedidos = normalizarLista(resPedidos, normalizarPedido);
            clientes = normalizarLista(resClientes, normalizarCliente);
            produtos = normalizarLista(resProdutos, normalizarProduto);
        }
        if (meuToken !== tokenRelatorioBI) return;

        const pedidosFiltrados = pedidos.filter((pedido) => {
            if (!mesSelecionado) return true;
            const data = parseData(pedido.data_criacao);
            if (!data) return false;
            return String(data.getMonth() + 1).padStart(2, '0') === mesSelecionado;
        });

        processarFaturamentoLucroMensal(pedidos, produtos);
        processarProdutosMaisVendidos(pedidosFiltrados, produtos);
        processarClientesFieis(pedidosFiltrados, clientes);
    } catch (err) {
        if (meuToken !== tokenRelatorioBI) return;
        tratarErro(err, 'Erro ao carregar relatórios de BI');
    }
}

function processarFaturamentoLucroMensal(pedidos, produtos) {
    const tbody = $('lista-faturamento-mes');
    if (!tbody) return;

    const mapaProdutos = indexarPorId(produtos);
    const mesesMap = {};

    pedidos.forEach((pedido) => {
        const data = parseData(pedido.data_criacao);
        if (!data) return;
        const anoMes = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
        if (!mesesMap[anoMes]) mesesMap[anoMes] = { faturamento: 0, custoTotal: 0 };

        pedido.itens.forEach((item) => {
            const prod = mapaProdutos.get(item.produto_id);
            const precoVenda = precoDoItem(item, prod);
            const precoCusto = prod?.preco_custo > 0 ? prod.preco_custo : precoVenda * CUSTO_BI_PADRAO_PERCENTUAL;
            mesesMap[anoMes].faturamento += item.quantidade * precoVenda;
            mesesMap[anoMes].custoTotal += item.quantidade * precoCusto;
        });
    });

    const mesesOrdenados = Object.keys(mesesMap).sort().reverse();
    if (!mesesOrdenados.length) {
        tbody.innerHTML = linhaMensagem(3, 'Nenhum dado encontrado');
        return;
    }

    tbody.innerHTML = mesesOrdenados.map((anoMes) => {
        const dados = mesesMap[anoMes];
        const lucro = dados.faturamento - dados.custoTotal;
        const [ano, mes] = anoMes.split('-');
        const nomeMes = new Date(Number(ano), Number(mes) - 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
        const nomeMesFormatado = nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1);
        return `<tr>
            <td>${esc(nomeMesFormatado)}</td>
            <td>R$ ${dados.faturamento.toFixed(2)}</td>
            <td style="color: green; font-weight: bold;">R$ ${lucro.toFixed(2)}</td>
        </tr>`;
    }).join('');
}

function processarProdutosMaisVendidos(pedidos, produtos) {
    const tbody = $('lista-produtos-bi');
    if (!tbody) return;

    const mapaProdutos = indexarPorId(produtos);
    const produtosMap = new Map();

    pedidos.forEach((pedido) => {
        pedido.itens.forEach((item) => {
            const prod = mapaProdutos.get(item.produto_id);
            const chave = item.produto_id ?? 'removido';
            if (!produtosMap.has(chave)) {
                produtosMap.set(chave, { nome: prod?.nome ?? 'Produto', quantidade: 0, totalReais: 0 });
            }
            const registro = produtosMap.get(chave);
            registro.quantidade += item.quantidade;
            registro.totalReais += item.quantidade * precoDoItem(item, prod);
        });
    });

    const lista = [...produtosMap.values()].sort((a, b) => b.quantidade - a.quantidade);
    if (!lista.length) {
        tbody.innerHTML = linhaMensagem(3, 'Nenhum dado para este período');
        return;
    }

    tbody.innerHTML = lista.map((item) => `<tr>
        <td>${esc(item.nome)}</td>
        <td>${item.quantidade}</td>
        <td>R$ ${item.totalReais.toFixed(2)}</td>
    </tr>`).join('');
}

function processarClientesFieis(pedidos, clientes) {
    const tbody = $('lista-clientes-bi');
    if (!tbody) return;

    const mapaClientes = indexarPorId(clientes);
    const clientesMap = new Map();

    pedidos.forEach((pedido) => {
        const chave = pedido.cliente_id ?? 'removido';
        if (!clientesMap.has(chave)) {
            clientesMap.set(chave, { nome: mapaClientes.get(pedido.cliente_id)?.nome ?? 'Cliente', totalPedidos: 0 });
        }
        clientesMap.get(chave).totalPedidos += 1;
    });

    const lista = [...clientesMap.values()].sort((a, b) => b.totalPedidos - a.totalPedidos);
    if (!lista.length) {
        tbody.innerHTML = linhaMensagem(2, 'Nenhum dado para este período');
        return;
    }

    tbody.innerHTML = lista.map((item) => `<tr>
        <td>${esc(item.nome)}</td>
        <td>${item.totalPedidos}</td>
    </tr>`).join('');
}

// ============================================================
// EXCLUSÕES
// ============================================================
async function excluirRegistro({ chave, endpoint, id, confirmacao, sucesso, falha }) {
    if (!confirm(confirmacao)) return;
    return executarUmaVez(`${chave}_${id}`, async () => {
        try {
            await requisitar(`${API_URL}/${endpoint}/${encodeURIComponent(id)}`, { method: 'DELETE' }, { json: false });
            mostrarMensagem(sucesso, 'sucesso');
            await carregarDados();
        } catch (err) {
            tratarErro(err, falha);
        }
    });
}

function excluirCliente(id) {
    return excluirRegistro({
        chave: 'excluirCliente', endpoint: 'clientes', id,
        confirmacao: 'Tem certeza que deseja excluir este cliente?',
        sucesso: 'Cliente excluído com sucesso!',
        falha: 'Erro ao excluir cliente'
    });
}

function excluirProduto(id) {
    return excluirRegistro({
        chave: 'excluirProduto', endpoint: 'produtos', id,
        confirmacao: 'Tem certeza que deseja excluir este produto?',
        sucesso: 'Produto excluído com sucesso!',
        falha: 'Erro ao excluir produto'
    });
}

function excluirPedido(id) {
    return excluirRegistro({
        chave: 'excluirPedido', endpoint: 'pedidos', id,
        confirmacao: 'Tem certeza que deseja excluir esta venda?',
        sucesso: 'Venda excluída com sucesso!',
        falha: 'Erro ao excluir venda'
    });
}