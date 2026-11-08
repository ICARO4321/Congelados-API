const API_URL = "https://congelados-api.onrender.com";
let chartVendasInstance = null;
let chartEstoqueInstance = null;
let chartHistoricoInstance = null;
let chartComparativoInstance = null;

let produtosGlobais = [];
let clientesGlobais = [];
let pedidosGlobais = [];
let custosProdutos = JSON.parse(localStorage.getItem('congelados_custos') || '{}');
let dadosPorMes = {};

document.addEventListener('DOMContentLoaded', () => {
    const role = localStorage.getItem('userRole');
    if (role !== 'admin') {
        document.querySelectorAll('.menu-admin-only').forEach(el => {
            el.style.display = 'none';
        });
    }
    carregarDados();
});

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebarOverlay').classList.toggle('active');
}

function mudarPagina(paginaId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.sidebar-menu li').forEach(m => m.classList.remove('active'));

    document.getElementById(`page-${paginaId}`).classList.add('active');
    document.getElementById(`menu-${paginaId}`).classList.add('active');

    const titulos = { 'dashboard': 'Dashboard Analítico', 'produtos': 'Produtos & Estoque', 'clientes': 'Gestão de Clientes', 'pedidos': 'Registrar Pedido (PDV)', 'historico': 'Histórico de Vendas', 'financas': 'Finanças & Lucro', 'relatorios': 'Relatórios Gerenciais BI' };
    document.getElementById('page-title').innerText = titulos[paginaId];

    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('active');

    if(paginaId === 'dashboard') atualizarGraficosDashboard();
    if(paginaId === 'historico') carregarHistoricoVendas();
    if(paginaId === 'relatorios') {
        atualizarRelatoriosBI();
        processarRelatoriosMensais();
        atualizarGraficoComparativo();
        popularSelectClientesHistorico();
    }
}

function converterImagem(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('prodFotoBase64').value = e.target.result;
            document.getElementById('previewFoto').src = e.target.result;
            document.getElementById('previewFoto').style.display = 'block';
        }
        reader.readAsDataURL(file);
    }
}

async function salvarProduto() {
    const id = document.getElementById('prodEditId').value;
    const payload = { nome: document.getElementById('prodNome').value, preco: parseFloat(document.getElementById('prodPreco').value), estoque: parseInt(document.getElementById('prodEstoque').value), foto: document.getElementById('prodFotoBase64').value };
    if (!payload.nome || isNaN(payload.preco) || isNaN(payload.estoque)) return alert("Preencha os campos obrigatórios.");
    const response = await fetch(id ? `${API_URL}/produtos/${id}` : `${API_URL}/produtos/`, { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (response.ok) { alert("Sucesso!"); limparFormularioProduto(); carregarDados(); }
}

function prepararEdicaoProduto(id, nome, preco, estoque, foto) {
    document.getElementById('prodEditId').value = id; document.getElementById('prodNome').value = nome; document.getElementById('prodPreco').value = preco; document.getElementById('prodEstoque').value = estoque; document.getElementById('prodFotoBase64').value = foto || '';
    if(foto) { document.getElementById('previewFoto').src = foto; document.getElementById('previewFoto').style.display = 'block'; }
    document.getElementById('formProdutoTitulo').innerText = "Editar Produto"; document.getElementById('btnCancelarProd').style.display = "inline-block"; mudarPagina('produtos');
}

function limparFormularioProduto() {
    document.getElementById('prodEditId').value = ''; document.getElementById('prodNome').value = ''; document.getElementById('prodPreco').value = ''; document.getElementById('prodEstoque').value = ''; document.getElementById('prodFotoFile').value = ''; document.getElementById('prodFotoBase64').value = ''; document.getElementById('previewFoto').style.display = 'none'; document.getElementById('formProdutoTitulo').innerText = "Cadastrar Novo Produto"; document.getElementById('btnCancelarProd').style.display = "none";
}

async function salvarCliente() {
    const id = document.getElementById('cliEditId').value;
    const payload = {
        nome: document.getElementById('cliNome').value,
        cnpj: document.getElementById('cliCnpj').value,
        telefone: document.getElementById('cliTelefone').value,
        cidade: document.getElementById('cliCidade').value,
        endereco: document.getElementById('cliEndereco').value,
        observacao: document.getElementById('cliObs').value
    };
    if (!payload.nome) return alert("Preencha o nome do cliente.");

    const response = await fetch(id ? `${API_URL}/clientes/${id}` : `${API_URL}/clientes/`, {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (response.ok) {
        alert("Cliente salvo com sucesso!");
        limparFormularioCliente();
        carregarDados();
    }
}

function prepararEdicaoCliente(id, nome, cnpj, telefone, cidade, endereco, obs) {
    document.getElementById('cliEditId').value = id;
    document.getElementById('cliNome').value = nome || '';
    document.getElementById('cliCnpj').value = cnpj || '';
    document.getElementById('cliTelefone').value = telefone || '';
    document.getElementById('cliCidade').value = cidade || '';
    document.getElementById('cliEndereco').value = endereco || '';
    document.getElementById('cliObs').value = obs || '';
    document.getElementById('formClienteTitulo').innerText = "Editar Cliente";
    document.getElementById('btnCancelarCli').style.display = "inline-block";
    mudarPagina('clientes');
}

function limparFormularioCliente() {
    document.getElementById('cliEditId').value = '';
    document.getElementById('cliNome').value = '';
    document.getElementById('cliCnpj').value = '';
    document.getElementById('cliTelefone').value = '';
    document.getElementById('cliCidade').value = '';
    document.getElementById('cliEndereco').value = '';
    document.getElementById('cliObs').value = '';
    document.getElementById('formClienteTitulo').innerText = "Cadastrar Novo Cliente";
    document.getElementById('btnCancelarCli').style.display = "none";
}

function atualizarCustoProduto(prodId, precoVenda) {
    const custo = parseFloat(document.getElementById(`custo_${prodId}`).value) || 0;
    custosProdutos[prodId] = custo; localStorage.setItem('congelados_custos', JSON.stringify(custosProdutos));
    const lucroUnit = precoVenda - custo; const margem = precoVenda > 0 ? ((lucroUnit / precoVenda) * 100).toFixed(1) : 0;
    document.getElementById(`lucro_${prodId}`).innerText = `R$ ${lucroUnit.toFixed(2)}`; document.getElementById(`margem_${prodId}`).innerText = `${margem}%`;
}

function selecionarProdutoPDV(id, nome, preco) {
    document.getElementById('pedidoProdutoId').value = id; document.getElementById('pdvProdutoSelecionadoNome').value = `${nome} (R$ ${preco.toFixed(2)})`; atualizarTotalPDV();
    document.querySelectorAll('.pdv-product-card').forEach(card => card.classList.remove('selected')); event.currentTarget.classList.add('selected');
}

function atualizarTotalPDV() {
    const prodId = document.getElementById('pedidoProdutoId').value; const qtd = parseInt(document.getElementById('pedidoQtd').value) || 1;
    if(!prodId) return document.getElementById('pdvTotalPreco').innerText = "R$ 0,00";
    const produto = produtosGlobais.find(p => p.id == prodId);
    if(produto) document.getElementById('pdvTotalPreco').innerText = `R$ ${(produto.preco * qtd).toFixed(2)}`;
}

async function criarPedido() {
    const clienteId = parseInt(document.getElementById('pedidoCliente').value);
    const produtoId = parseInt(document.getElementById('pedidoProdutoId').value);
    const quantidade = parseInt(document.getElementById('pedidoQtd').value) || 1;

    if (!clienteId || !produtoId || isNaN(quantidade)) {
        return alert("Selecione um cliente, um produto e a quantidade.");
    }

    const produto = produtosGlobais.find(p => p.id === produtoId);
    const precoVenda = produto ? parseFloat(produto.preco) : 0;

    const payload = {
        cliente_id: clienteId,
        itens: [
            {
                produto_id: produtoId,
                quantidade: quantidade,
                preco_venda: precoVenda
            }
        ]
    };

    try {
        const response = await fetch(`${API_URL}/pedidos/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            alert("Pedido realizado com sucesso!");
            document.getElementById('pedidoProdutoId').value = '';
            document.getElementById('pdvProdutoSelecionadoNome').value = 'Nenhum selecionado';
            document.getElementById('pdvTotalPreco').innerText = "R$ 0,00";
            document.getElementById('pedidoQtd').value = '1';
            carregarDados();
        } else {
            alert("Erro ao realizar pedido.");
        }
    } catch (err) {
        console.error("Erro de conexão:", err);
        alert("Erro de conexão com o servidor ao registrar a venda.");
    }
}

async function atualizarGraficosDashboard() {
    const resMais = await fetch(`${API_URL}/relatorios/produtos-mais-vendidos`);
    const maisVendidos = await resMais.json();
    if (chartVendasInstance) chartVendasInstance.destroy();
    chartVendasInstance = new Chart(document.getElementById('graficoVendas').getContext('2d'), { type: 'bar', data: { labels: maisVendidos.map(m => m.produto), datasets: [{ label: 'Qtd', data: maisVendidos.map(m => m.quantidade_vendida), backgroundColor: '#ea580c', borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false } });
    if (chartEstoqueInstance) chartEstoqueInstance.destroy();
    chartEstoqueInstance = new Chart(document.getElementById('graficoEstoque').getContext('2d'), { type: 'doughnut', data: { labels: produtosGlobais.map(p => p.nome), datasets: [{ data: produtosGlobais.map(p => p.estoque), backgroundColor: ['#ea580c', '#0ea5e9', '#16a34a', '#eab308', '#6366f1'] }] }, options: { responsive: true, maintainAspectRatio: false } });
}

async function atualizarGraficoComparativo() {
    try {
        const resMais = await fetch(`${API_URL}/relatorios/produtos-mais-vendidos`);
        const maisVendidos = await resMais.json();

        const labels = [];
        const faturamentos = [];
        const lucrosTotais = [];

        maisVendidos.forEach(m => {
            labels.push(m.produto);
            faturamentos.push(m.total_em_reais);
            
            const prod = produtosGlobais.find(p => p.nome === m.produto);
            let custoUnit = 0;
            if(prod) {
                custoUnit = custosProdutos[prod.id] !== undefined ? custosProdutos[prod.id] : (prod.preco * 0.4);
            }
            const lucroUnit = (prod ? prod.preco : 0) - custoUnit;
            lucrosTotais.push(lucroUnit * m.quantidade_vendida);
        });

        if (chartComparativoInstance) chartComparativoInstance.destroy();
        chartComparativoInstance = new Chart(document.getElementById('graficoComparativoLucro').getContext('2d'), {
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
    } catch (e) { console.error(e); }
}

function processarRelatoriosMensais() {
    dadosPorMes = {};
    
    pedidosGlobais.forEach(ped => {
        const date = new Date(ped.data_criacao);
        const mesAno = `${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
        
        if(!dadosPorMes[mesAno]) {
            dadosPorMes[mesAno] = { totalFaturado: 0, totalLucro: 0, clientes: {} };
        }
        
        let faturamentoPed = 0;
        let lucroPed = 0;
        
        ped.itens.forEach(item => {
            const prod = produtosGlobais.find(p => p.id === item.produto_id);
            const precoVendaItem = parseFloat(item.preco_venda) || (prod ? parseFloat(prod.preco) : 0);
            const fatItem = item.quantidade * precoVendaItem;
            faturamentoPed += fatItem;
            
            let custoUnit = prod ? (custosProdutos[prod.id] !== undefined ? custosProdutos[prod.id] : (prod.preco * 0.4)) : 0;
            lucroPed += (precoVendaItem - custoUnit) * item.quantidade;
        });
        
        dadosPorMes[mesAno].totalFaturado += faturamentoPed;
        dadosPorMes[mesAno].totalLucro += lucroPed;
        
        if(!dadosPorMes[mesAno].clientes[ped.cliente_id]) {
            dadosPorMes[mesAno].clientes[ped.cliente_id] = 0;
        }
        dadosPorMes[mesAno].clientes[ped.cliente_id] += faturamentoPed;
    });

    const mesesLabels = Object.keys(dadosPorMes).sort();
    const faturamentos = mesesLabels.map(mes => dadosPorMes[mes].totalFaturado);

    if (chartHistoricoInstance) chartHistoricoInstance.destroy();
    chartHistoricoInstance = new Chart(document.getElementById('graficoHistoricoMeses').getContext('2d'), {
        type: 'bar',
        data: {
            labels: mesesLabels.length ? mesesLabels : ['Sem Vendas'],
            datasets: [{ label: 'Faturamento (R$)', data: faturamentos, backgroundColor: '#0ea5e9', borderRadius: 4 }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    const selectMes = document.getElementById('selectFiltroMes');
    selectMes.innerHTML = '';
    mesesLabels.forEach(mes => {
        selectMes.innerHTML += `<option value="${mes}">${mes}</option>`;
    });

    if(mesesLabels.length > 0) {
        selectMes.value = mesesLabels[mesesLabels.length - 1];
        atualizarTabelaMes();
    } else {
        document.getElementById('tabelaRankingClientesMes').innerHTML = '<tr><td colspan="3">Nenhuma venda.</td></tr>';
    }
}

function atualizarTabelaMes() {
    const mesSelecionado = document.getElementById('selectFiltroMes').value;
    const dados = dadosPorMes[mesSelecionado];
    if(!dados) return;

    document.getElementById('totalFaturadoMes').innerText = `R$ ${dados.totalFaturado.toFixed(2)}`;
    document.getElementById('totalLucroMes').innerText = `R$ ${dados.totalLucro.toFixed(2)}`;

    const ranking = Object.keys(dados.clientes).map(cliId => {
        const clienteObj = clientesGlobais.find(c => c.id == cliId);
        return { nome: clienteObj ? clienteObj.nome : `ID ${cliId}`, total: dados.clientes[cliId] };
    }).sort((a, b) => b.total - a.total);

    const tabela = document.getElementById('tabelaRankingClientesMes');
    tabela.innerHTML = '';
    ranking.forEach((cli, index) => {
        let trofeu = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index+1}º`;
        tabela.innerHTML += `<tr><td style="font-weight:bold;">${trofeu}</td><td>${cli.nome}</td><td style="font-weight:bold; color:var(--primary);">R$ ${cli.total.toFixed(2)}</td></tr>`;
    });
}

function popularSelectClientesHistorico() {
    const select = document.getElementById('selectHistoricoCliente');
    select.innerHTML = '<option value="">Selecione um cliente...</option>';
    clientesGlobais.forEach(c => {
        select.innerHTML += `<option value="${c.id}">${c.nome}</option>`;
    });
}

function abrirWhatsApp(telefone, nomeCliente) {
    if (!telefone) {
        alert("Este cliente não possui telefone cadastrado!");
        return;
    }
    let numeroLimpo = telefone.replace(/\D/g, '');
    if (numeroLimpo.length <= 11) {
        numeroLimpo = '55' + numeroLimpo;
    }
    const mensagem = encodeURIComponent(`Olá ${nomeCliente}, aqui está o recibo dos seus produtos congelados! 🧊`);
    window.open(`https://wa.me/${numeroLimpo}?text=${mensagem}`, '_blank');
}

async function gerarReciboPDF(pedidoId, clienteNome, dataStr) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Congelados & Cia", 105, 20, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Comprovante de Venda / Recibo", 105, 26, { align: "center" });
    doc.line(14, 32, 196, 32);

    doc.setFontSize(11);
    doc.text(`Pedido Nº: #${pedidoId}`, 14, 42);
    doc.text(`Cliente: ${clienteNome}`, 14, 49);
    doc.text(`Data: ${new Date(dataStr).toLocaleString('pt-BR')}`, 14, 56);
    doc.line(14, 62, 196, 62);

    doc.setFont("helvetica", "bold");
    doc.text("Qtd", 14, 70);
    doc.text("Produto", 30, 70);
    doc.text("Preço Unit.", 140, 70, { align: "right" });
    doc.text("Subtotal", 190, 70, { align: "right" });
    doc.line(14, 73, 196, 73);

    try {
        const res = await fetch(`${API_URL}/pedidos/`);
        const pedidos = await res.json();
        const pedido = pedidos.find(p => p.id === pedidoId);

        let y = 80;
        let totalGeral = 0;

        if (pedido && pedido.itens) {
            doc.setFont("helvetica", "normal");
            pedido.itens.forEach(item => {
                const prod = produtosGlobais.find(p => p.id === item.produto_id);
                const nomeProd = prod ? prod.nome : `Produto ID ${item.produto_id}`;
                const precoVenda = parseFloat(item.preco_venda) || (prod ? parseFloat(prod.preco) : 0);
                const subtotal = item.quantidade * precoVenda;
                totalGeral += subtotal;

                doc.text(String(item.quantidade), 14, y);
                doc.text(String(nomeProd), 30, y);
                doc.text(`R$ ${precoVenda.toFixed(2)}`, 140, y, { align: "right" });
                doc.text(`R$ ${subtotal.toFixed(2)}`, 190, y, { align: "right" });
                y += 8;
            });
        }

        doc.line(14, y + 2, 196, y + 2);
        doc.setFont("helvetica", "bold");
        doc.text(`Total Geral: R$ ${totalGeral.toFixed(2)}`, 190, y + 10, { align: "right" });

        doc.save(`recibo_pedido_${pedidoId}.pdf`);
    } catch (err) {
        console.error("Erro ao gerar PDF:", err);
        alert("Erro ao gerar o recibo em PDF.");
    }
}

function atualizarHistoricoCliente() {
    const clienteId = document.getElementById('selectHistoricoCliente').value;
    const tabela = document.getElementById('tabelaHistoricoClienteDetalhado');
    tabela.innerHTML = '';

    if(!clienteId) {
        document.getElementById('clienteTotalGasto').innerText = "R$ 0,00";
        document.getElementById('clienteTotalPedidos').innerText = "0";
        tabela.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#64748b;">Nenhum cliente selecionado.</td></tr>';
        return;
    }

    const pedidosCliente = pedidosGlobais.filter(p => p.cliente_id == clienteId);
    let totalGastoGeral = 0;

    if(pedidosCliente.length === 0) {
        document.getElementById('clienteTotalGasto').innerText = "R$ 0,00";
        document.getElementById('clienteTotalPedidos').innerText = "0";
        tabela.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#64748b;">Nenhuma compra registrada.</td></tr>';
        return;
    }

    pedidosCliente.forEach(ped => {
        let totalPedido = 0;
        let itensDesc = [];

        ped.itens.forEach(item => {
            const prod = produtosGlobais.find(p => p.id === item.produto_id);
            const nomeProd = prod ? prod.nome : `Produto ID ${item.produto_id}`;
            const precoVenda = parseFloat(item.preco_venda) || (prod ? parseFloat(prod.preco) : 0);
            const subtotal = item.quantidade * precoVenda;
            totalPedido += subtotal;
            itensDesc.push(`${item.quantidade}x ${nomeProd}`);
        });

        totalGastoGeral += totalPedido;
        const dataFormatada = new Date(ped.data_criacao).toLocaleDateString('pt-BR');
        const clienteObj = clientesGlobais.find(c => c.id == ped.cliente_id);
        const nomeCli = clienteObj ? clienteObj.nome : 'Cliente';

        tabela.innerHTML += `
            <tr>
                <td style="font-weight:bold;">#${ped.id}</td>
                <td>${dataFormatada}</td>
                <td>${itensDesc.join(', ')}</td>
                <td style="font-weight:bold; color:var(--success);">R$ ${totalPedido.toFixed(2)}</td>
                <td>
                    <button class="btn-editar" onclick="gerarReciboPDF(${ped.id}, '${nomeCli}', '${ped.data_criacao}')">📄 PDF</button>
                    <button class="btn-excluir" onclick="excluirPedido(${ped.id})">Excluir</button>
                </td>
            </tr>`;
    });

    document.getElementById('clienteTotalGasto').innerText = `R$ ${totalGastoGeral.toFixed(2)}`;
    document.getElementById('clienteTotalPedidos').innerText = pedidosCliente.length;
}

function carregarHistoricoVendas() {
    const tbody = document.getElementById('lista-historico-vendas');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!Array.isArray(pedidosGlobais) || pedidosGlobais.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#64748b;">Nenhuma venda registrada.</td></tr>`;
        return;
    }

    const pedidosOrdenados = [...pedidosGlobais].sort((a, b) => {
        const dataA = new Date(a.data_criacao || 0).getTime();
        const dataB = new Date(b.data_criacao || 0).getTime();
        return dataB - dataA || Number(b.id) - Number(a.id);
    });

    pedidosOrdenados.forEach(pedido => {
        const cliente = clientesGlobais.find(c => c.id == pedido.cliente_id);
        const nomeCliente = cliente ? cliente.nome : 'Cliente Deletado';
        const data = pedido.data_criacao ? new Date(pedido.data_criacao).toLocaleDateString('pt-BR') : '-';
        const status = pedido.status || 'Concluído';

        tbody.innerHTML += `
            <tr>
                <td style="font-weight:bold;">#${pedido.id}</td>
                <td>${data}</td>
                <td>${nomeCliente}</td>
                <td>${status}</td>
                <td>
                    <button class="btn-imprimir" onclick="gerarRecibo(${pedido.id})">🖨️ Recibo</button>
                </td>
            </tr>
        `;
    });
}

function gerarRecibo(pedidoId) {
    const pedido = pedidosGlobais.find(p => p.id == pedidoId);
    if (!pedido) {
        alert("Pedido não encontrado.");
        return;
    }

    const cliente = clientesGlobais.find(c => c.id == pedido.cliente_id);

    document.getElementById('recibo-dados-cliente').innerHTML = `
        <strong>Cliente:</strong> ${cliente ? cliente.nome : 'N/A'}<br>
        <strong>Telefone:</strong> ${cliente && cliente.telefone ? cliente.telefone : 'N/A'}<br>
        <strong>Endereço:</strong> ${cliente && cliente.endereco ? cliente.endereco : 'N/A'}<br>
        <strong>Data:</strong> ${pedido.data_criacao ? new Date(pedido.data_criacao).toLocaleString('pt-BR') : 'N/A'}
    `;

    const tbodyItens = document.getElementById('recibo-itens');
    tbodyItens.innerHTML = '';

    let valorTotal = 0;

    (pedido.itens || []).forEach(item => {
        const produto = produtosGlobais.find(p => p.id == item.produto_id);
        const nomeProduto = produto ? produto.nome : 'Produto Excluído';
        const precoVenda = parseFloat(item.preco_venda) || (produto ? parseFloat(produto.preco) : 0);
        const quantidade = parseInt(item.quantidade) || 0;
        const subtotal = quantidade * precoVenda;

        valorTotal += subtotal;

        tbodyItens.innerHTML += `
            <tr>
                <td>${quantidade}x</td>
                <td>${nomeProduto}</td>
                <td>R$ ${precoVenda.toFixed(2)}</td>
                <td>R$ ${subtotal.toFixed(2)}</td>
            </tr>
        `;
    });

    document.getElementById('recibo-total').innerText = `Total: R$ ${valorTotal.toFixed(2)}`;

    const reciboDiv = document.getElementById('recibo-venda');
    reciboDiv.style.display = 'block';

    setTimeout(() => {
        window.print();
        const esconderRecibo = () => {
            reciboDiv.style.display = 'none';
            window.removeEventListener('afterprint', esconderRecibo);
        };
        window.addEventListener('afterprint', esconderRecibo);
    }, 100);
}

async function atualizarRelatoriosBI() {
    const filtro = document.getElementById('filtro-mes');
    if (!filtro) return;
    const mesSelecionado = filtro.value;

    try {
        const [resPedidos, resClientes, resProdutos] = await Promise.all([
            fetch(`${API_URL}/pedidos/`),
            fetch(`${API_URL}/clientes/`),
            fetch(`${API_URL}/produtos/`)
        ]);

        const pedidos = await resPedidos.json();
        const clientes = await resClientes.json();
        const produtos = await resProdutos.json();

        const pedidosFiltrados = pedidos.filter(pedido => {
            if (!mesSelecionado) return true;
            const dataPedido = new Date(pedido.data_criacao);
            const mesPedido = String(dataPedido.getMonth() + 1).padStart(2, '0');
            return mesPedido === mesSelecionado;
        });

        processarFaturamentoLucroMensal(pedidos, produtos);
        processarProdutosMaisVendidos(pedidosFiltrados, produtos);
        processarClientesFieis(pedidosFiltrados, clientes);
    } catch (error) {
        console.error("Erro ao carregar relatórios BI:", error);
    }
}

function processarFaturamentoLucroMensal(pedidos, produtos) {
    const tbody = document.getElementById('lista-faturamento-mes');
    if (!tbody) return;
    tbody.innerHTML = '';
    const mesesMap = {};

    pedidos.forEach(pedido => {
        const data = new Date(pedido.data_criacao);
        if (Number.isNaN(data.getTime())) return;

        const anoMes = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
        if (!mesesMap[anoMes]) {
            mesesMap[anoMes] = { faturamento: 0, custoTotal: 0 };
        }

        (pedido.itens || []).forEach(item => {
            const prod = produtos.find(p => p.id == item.produto_id);
            const precoVenda = parseFloat(item.preco_venda) || (prod ? parseFloat(prod.preco) : 0);
            const precoCusto = prod && parseFloat(prod.preco_custo) ? parseFloat(prod.preco_custo) : precoVenda * 0.5;
            const quantidade = parseInt(item.quantidade) || 0;

            mesesMap[anoMes].faturamento += quantidade * precoVenda;
            mesesMap[anoMes].custoTotal += quantidade * precoCusto;
        });
    });

    const mesesOrdenados = Object.keys(mesesMap).sort().reverse();
    if (mesesOrdenados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Nenhum dado encontrado</td></tr>';
        return;
    }

    mesesOrdenados.forEach(anoMes => {
        const dados = mesesMap[anoMes];
        const lucro = dados.faturamento - dados.custoTotal;
        const [ano, mes] = anoMes.split('-');
        const nomeMes = new Date(Number(ano), Number(mes) - 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
        const nomeMesFormatado = nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1);

        tbody.innerHTML += `
            <tr>
                <td>${nomeMesFormatado}</td>
                <td>R$ ${dados.faturamento.toFixed(2)}</td>
                <td style="color: green; font-weight: bold;">R$ ${lucro.toFixed(2)}</td>
            </tr>
        `;
    });
}

function processarProdutosMaisVendidos(pedidos, produtos) {
    const tbody = document.getElementById('lista-produtos-bi');
    if (!tbody) return;
    tbody.innerHTML = '';
    const produtosMap = {};

    pedidos.forEach(pedido => {
        (pedido.itens || []).forEach(item => {
            if (!produtosMap[item.produto_id]) {
                const prod = produtos.find(p => p.id == item.produto_id);
                produtosMap[item.produto_id] = { nome: prod ? prod.nome : 'Produto Removido', quantidade: 0, totalReais: 0 };
            }
            const prod = produtos.find(p => p.id == item.produto_id);
            const precoVenda = parseFloat(item.preco_venda) || (prod ? parseFloat(prod.preco) : 0);
            const quantidade = parseInt(item.quantidade) || 0;

            produtosMap[item.produto_id].quantidade += quantidade;
            produtosMap[item.produto_id].totalReais += quantidade * precoVenda;
        });
    });

    const listaOrdenada = Object.values(produtosMap).sort((a, b) => b.quantidade - a.quantidade);
    if (listaOrdenada.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Nenhum dado para este período</td></tr>';
        return;
    }

    listaOrdenada.forEach(item => {
        tbody.innerHTML += `
            <tr>
                <td>${item.nome}</td>
                <td>${item.quantidade}</td>
                <td>R$ ${item.totalReais.toFixed(2)}</td>
            </tr>
        `;
    });
}

function processarClientesFieis(pedidos, clientes) {
    const tbody = document.getElementById('lista-clientes-bi');
    if (!tbody) return;
    tbody.innerHTML = '';
    const clientesMap = {};

    pedidos.forEach(pedido => {
        if (!clientesMap[pedido.cliente_id]) {
            const cli = clientes.find(c => c.id == pedido.cliente_id);
            clientesMap[pedido.cliente_id] = { nome: cli ? cli.nome : 'Cliente Removido', totalPedidos: 0 };
        }
        clientesMap[pedido.cliente_id].totalPedidos += 1;
    });

    const listaOrdenada = Object.values(clientesMap).sort((a, b) => b.totalPedidos - a.totalPedidos);
    if (listaOrdenada.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;">Nenhum dado para este período</td></tr>';
        return;
    }

    listaOrdenada.forEach(item => {
        tbody.innerHTML += `
            <tr>
                <td>${item.nome}</td>
                <td>${item.totalPedidos}</td>
            </tr>
        `;
    });
}

async function carregarDados() {
    try {
        const resProd = await fetch(`${API_URL}/produtos/`); produtosGlobais = await resProd.json();
        const resCli = await fetch(`${API_URL}/clientes/`); clientesGlobais = await resCli.json();
        const resPed = await fetch(`${API_URL}/pedidos/`); pedidosGlobais = await resPed.json();

        const catalogo = document.getElementById('catalogoProdutos'); 
        const pdvLista = document.getElementById('pdvListaProdutos'); 
        const tabelaFinancas = document.getElementById('tabelaFinancasLucro'); 
        const tabelaRelLucro = document.getElementById('tabelaRelatorioLucroTotal');
        
        catalogo.innerHTML = ''; pdvLista.innerHTML = ''; tabelaFinancas.innerHTML = ''; tabelaRelLucro.innerHTML = '';
        let valorEstoque = 0;

        produtosGlobais.forEach(p => {
            const preco = parseFloat(p.preco) || 0; valorEstoque += (preco * p.estoque);
            const img = p.foto || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300';
            const custo = custosProdutos[p.id] !== undefined ? custosProdutos[p.id] : (preco * 0.4);
            const lucroUnit = preco - custo; const margem = preco > 0 ? ((lucroUnit / preco) * 100).toFixed(1) : 0;

            catalogo.innerHTML += `<div class="product-card"><img src="${img}" class="product-img"><div class="product-info"><div><h4 style="margin:0 0 4px 0;font-size:0.85rem;">${p.nome}</h4><p style="margin:0;color:#64748b;font-size:0.75rem;">R$ ${preco.toFixed(2)} | Est: <strong>${p.estoque}</strong></p></div><div style="margin-top:6px;display:flex;gap:4px;"><button class="btn-editar" onclick="prepararEdicaoProduto(${p.id},'${p.nome}',${preco},${p.estoque},'${p.foto || ''}')">Editar</button><button class="btn-excluir" onclick="excluirProduto(${p.id})">Excluir</button></div></div></div>`;
            pdvLista.innerHTML += `<div class="pdv-product-card" onclick="selecionarProdutoPDV(${p.id},'${p.nome}',${preco})"><img src="${img}" class="pdv-img"><div style="flex:1; min-width:0;"><h4 style="margin:0 0 2px 0;font-size:0.85rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.nome}</h4><p style="margin:0;font-size:0.75rem;color:#64748b;">R$ ${preco.toFixed(2)} | Est: ${p.estoque}</p></div></div>`;
            tabelaFinancas.innerHTML += `<tr><td><img src="${img}" style="width:30px;height:30px;object-fit:cover;border-radius:4px;"></td><td style="font-weight:bold;">${p.nome}</td><td><input type="number" step="0.01" id="custo_${p.id}" value="${custo}" oninput="atualizarCustoProduto(${p.id}, ${preco})" style="width:65px;padding:4px;font-size:0.8rem;"></td><td>R$ ${preco.toFixed(2)}</td><td id="lucro_${p.id}" style="color:var(--success);font-weight:bold;">R$ ${lucroUnit.toFixed(2)}</td><td id="margem_${p.id}" style="font-weight:bold;">${margem}%</td></tr>`;
        });

        document.getElementById('statTotalProdutos').innerText = produtosGlobais.length; 
        document.getElementById('statValorEstoque').innerText = `R$ ${valorEstoque.toFixed(2)}`;

        const tabCli = document.getElementById('tabelaClientes'); 
        const selCli = document.getElementById('pedidoCliente');
        tabCli.innerHTML = ''; selCli.innerHTML = '<option value="">Selecione...</option>';
        
        clientesGlobais.forEach(c => {
            tabCli.innerHTML += `<tr>
                <td>${c.id}</td>
                <td style="font-weight:bold;">${c.nome}</td>
                <td>${c.cnpj || '-'}</td>
                <td>${c.telefone || '-'}</td>
                <td>${c.cidade || '-'}</td>
                <td>${c.endereco || '-'}</td>
                <td>${c.observacao || '-'}</td>
                <td>
                    <button class="btn-editar" onclick="prepararEdicaoCliente(${c.id}, '${c.nome}', '${c.cnpj || ''}', '${c.telefone || ''}', '${c.cidade || ''}', '${c.endereco || ''}', '${c.observacao || ''}')">Editar</button>
                    <button class="btn-excluir" onclick="excluirCliente(${c.id})">Excluir</button>
                    <button onclick="abrirWhatsApp('${c.telefone || ''}', '${c.nome}')" style="background-color: #25D366; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 0.75rem;" title="Abrir WhatsApp">💬 Wpp</button>
                </td>
            </tr>`;
            selCli.innerHTML += `<option value="${c.id}">${c.nome}</option>`;
        });
        document.getElementById('statTotalClientes').innerText = clientesGlobais.length;

        const resMais = await fetch(`${API_URL}/relatorios/produtos-mais-vendidos`);
        const maisVendidos = await resMais.json();
        maisVendidos.forEach(m => {
            const prod = produtosGlobais.find(p => p.nome === m.produto);
            const custoUnit = prod ? (custosProdutos[prod.id] !== undefined ? custosProdutos[prod.id] : (prod.preco * 0.4)) : 0;
            const lucroTotal = (m.total_em_reais) - (custoUnit * m.quantidade_vendida);
            tabelaRelLucro.innerHTML += `<tr><td>${m.produto}</td><td>${m.quantidade_vendida} un</td><td>R$ ${m.total_em_reais.toFixed(2)}</td><td style="color:var(--success);font-weight:bold;">R$ ${lucroTotal.toFixed(2)}</td></tr>`;
        });

        atualizarGraficosDashboard();
        carregarHistoricoVendas();
        atualizarRelatoriosBI();
        if(document.getElementById('page-relatorios').classList.contains('active')) {
            processarRelatoriosMensais();
            atualizarGraficoComparativo();
            popularSelectClientesHistorico();
        }
    } catch (e) { console.error(e); }
}

async function excluirCliente(id) {
    if (!confirm("Tem certeza que deseja excluir este cliente?")) return;
    try {
        const response = await fetch(`${API_URL}/clientes/${id}`, { method: 'DELETE' });
        if (response.ok) { alert("Cliente excluído com sucesso!"); carregarDados(); }
        else { alert("Erro ao excluir cliente."); }
    } catch (err) { console.error("Erro:", err); }
}

async function excluirProduto(id) {
    if (!confirm("Tem certeza que deseja excluir este produto?")) return;
    try {
        const response = await fetch(`${API_URL}/produtos/${id}`, { method: 'DELETE' });
        if (response.ok) { alert("Produto excluído com sucesso!"); carregarDados(); }
        else { alert("Erro ao excluir produto."); }
    } catch (err) { console.error("Erro:", err); }
}

async function excluirPedido(id) {
    if (!confirm("Tem certeza que deseja excluir esta venda?")) return;
    try {
        const response = await fetch(`${API_URL}/pedidos/${id}`, { method: 'DELETE' });
        if (response.ok) { alert("Venda excluída com sucesso!"); carregarDados(); }
        else { alert("Erro ao excluir venda."); }
    } catch (err) { console.error("Erro:", err); }
}