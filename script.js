let totalGeral = '0'; // armazenado como string decimal exata
let entries = [];
let boletos = []; // novo array para cargas no boleto
let resumoVolumeRows = [];
let entryIdCounter = 1;
let activeFilters = { unidade: '', distribuidora: '', produto: '' };
let boletoFilters = { unidade: '', distribuidora: '', produto: '' };
let distribChart = null;

// ===== FUNÇÕES DE NAVEGAÇÃO POR ABAS =====
function switchTab(tabId) {
	// Ocultar todas as abas
	const allTabs = document.querySelectorAll('.tab-content');
	allTabs.forEach(tab => tab.classList.remove('active'));

	// Remover classe ativa de todos os botões
	const allButtons = document.querySelectorAll('.tab-button');
	allButtons.forEach(btn => btn.classList.remove('active'));

	// Mostrar a aba selecionada
	const selectedTab = document.getElementById(tabId);
	if (selectedTab) {
		selectedTab.classList.add('active');
	}

	// Marcar o botão como ativo
	event.target.closest('.tab-button').classList.add('active');
}

// ===== FUNÇÕES DE CONTROLE DO MENU LATERAL =====
function toggleSidebar() {
	const sidebar = document.getElementById('sidebar');
	const toggle = document.querySelector('.sidebar-toggle');
	const overlay = document.getElementById('sidebarOverlay');

	if (sidebar && toggle) {
		const isClosed = sidebar.classList.contains('closed');

		if (isClosed) {
			sidebar.classList.remove('closed');
			toggle.classList.add('active');
			if (overlay) overlay.classList.add('active');
			localStorage.setItem('sidebarState', 'open');
		} else {
			sidebar.classList.add('closed');
			toggle.classList.remove('active');
			if (overlay) overlay.classList.remove('active');
			localStorage.setItem('sidebarState', 'closed');
		}
	}
}

// Restaurar estado do sidebar ao carregar a página
window.addEventListener('DOMContentLoaded', function() {
	const sidebarState = localStorage.getItem('sidebarState') || 'open';
	const sidebar = document.getElementById('sidebar');
	const toggle = document.querySelector('.sidebar-toggle');
	const overlay = document.getElementById('sidebarOverlay');

	if (sidebarState === 'closed') {
		if (sidebar) sidebar.classList.add('closed');
		if (toggle) toggle.classList.remove('active');
		if (overlay) overlay.classList.remove('active');
	} else {
		if (sidebar) sidebar.classList.remove('closed');
		if (toggle) toggle.classList.add('active');
		if (overlay) overlay.classList.add('active');
	}
});

function openDistribuidorPanel() {
	const panel = document.getElementById('distribPanel');
	if (!panel) return;
	panel.style.display = 'flex';
	renderDistribuidorChart();
}

function closeDistribuidorPanel() {
	const panel = document.getElementById('distribPanel');
	if (!panel) return;
	panel.style.display = 'none';
}

function renderDistribuidorChart() {
	// agrupa os totais por distribuidora (somente entradas não removidas)
	const groups = {};
	entries.forEach(entry => {
		if (entry.removed) return;
		const key = String(entry.distribuidora || 'Sem Distribuidora').trim();
		if (!groups[key]) groups[key] = '0';
		groups[key] = addDecimalStrings(groups[key], entry.totalStr || '0');
	});

	const labels = Object.keys(groups);
	const dataValues = labels.map(l => {
		const v = groups[l] || '0';
		return parseFloat(String(v)) || 0;
	});

	const ctx = document.getElementById('distribChart').getContext('2d');

	if (distribChart) {
		distribChart.data.labels = labels;
		distribChart.data.datasets[0].data = dataValues;
		distribChart.update();
		return;
	}

	const colors = labels.map((_, i) => {
		const base = ["#2563eb","#9333ea","#10b981","#f59e0b","#ef4444","#06b6d4","#7c3aed"];
		return base[i % base.length];
	});

	distribChart = new Chart(ctx, {
		type: 'bar',
		data: {
			labels: labels,
			datasets: [{
				label: 'Total (R$)',
				data: dataValues,
				backgroundColor: colors,
				borderRadius: 6,
				barPercentage: 0.6
			}]
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			scales: {
				y: {
					beginAtZero: true,
					ticks: {
						callback: function(value) { return 'R$ ' + Number(value).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2}); }
					}
				}
			},
			plugins: {
				tooltip: {
					callbacks: {
						label: function(context) {
							const val = context.parsed.y !== undefined ? context.parsed.y : context.parsed;
							return 'R$ ' + Number(val).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
						}
					}
				},
				legend: { display: false }
			}
		}
	});
}

function saveState() {
	const state = {
		entries,
		boletos,
		resumoVolumeRows,
		entryIdCounter,
		activeFilters,
		boletoFilters
	};
	localStorage.setItem('wkComprasState', JSON.stringify(state));
}

function loadState() {
	const raw = localStorage.getItem('wkComprasState');
	if (!raw) return;
	try {
		const state = JSON.parse(raw);
		if (Array.isArray(state.entries)) entries = state.entries.map(entry => ({ etiqueta: '', ...entry }));
		if (Array.isArray(state.boletos)) boletos = state.boletos.map(boleto => ({ etiqueta: '', selected: Boolean(boleto.selected), ...boleto }));
		if (Array.isArray(state.resumoVolumeRows)) resumoVolumeRows = state.resumoVolumeRows.map(row => ({ unidade: '', produto: '', total: '0', ...row }));
		entryIdCounter = typeof state.entryIdCounter === 'number' && state.entryIdCounter > 0 ? state.entryIdCounter : entryIdCounter;
		activeFilters = state.activeFilters || activeFilters;
		boletoFilters = state.boletoFilters || boletoFilters;
		if (document.getElementById('filterUnidade')) document.getElementById('filterUnidade').value = activeFilters.unidade || '';
		if (document.getElementById('filterDistribuidora')) document.getElementById('filterDistribuidora').value = activeFilters.distribuidora || '';
		if (document.getElementById('filterProduto')) document.getElementById('filterProduto').value = activeFilters.produto || '';
		if (document.getElementById('filterBoletoUnidade')) document.getElementById('filterBoletoUnidade').value = boletoFilters.unidade || '';
		if (document.getElementById('filterBoletoDistribuidora')) document.getElementById('filterBoletoDistribuidora').value = boletoFilters.distribuidora || '';
		if (document.getElementById('filterBoletoProduto')) document.getElementById('filterBoletoProduto').value = boletoFilters.produto || '';
		renderTable();
		renderTabelaBoleto();
		renderResumoVolumeTable();
	} catch (err) {
		console.warn('Não foi possível carregar estado salvo:', err);
	}
}

function toggleSelectEntry(id, checked) {
	const entry = entries.find(e => String(e.id) === String(id));
	if (!entry) return;
	entry.selected = Boolean(checked);
}

function toggleSelectAll(checkbox) {
	const checked = Boolean(checkbox.checked);
	const fUnidade = (activeFilters.unidade || '').toLowerCase().trim();
	const fDistrib = (activeFilters.distribuidora || '').toLowerCase().trim();
	const fProd = (activeFilters.produto || '').toLowerCase().trim();
	entries.forEach(entry => {
		if (entry.removed) { entry.selected = false; return; }
		if (fUnidade && !String(entry.unidade || '').toLowerCase().includes(fUnidade)) return;
		if (fDistrib && !String(entry.distribuidora || '').toLowerCase().includes(fDistrib)) return;
		if (!produtoFiltra(entry.produto, fProd)) return;
		entry.selected = checked;
	});
	renderTable();
}

function clearSelection() {
	entries.forEach(e => e.selected = false);
	const chk = document.getElementById('selectAllCheckbox'); if (chk) chk.checked = false;
	renderTable();
}

function produtoFiltra(entryProduto, filtroProduto) {
	const normalize = str => String(str || '').toLowerCase().replace(/[-\s]/g, '');
	const entryNorm = normalize(entryProduto);
	const filtroNorm = normalize(filtroProduto);
	if (!filtroNorm) return true;

	const produtoMap = {
		gc: ['gc', 'gasolinacomum'],
		gad: ['gad', 'gasolinaaditivada'],
		's10': ['s10'],
		's500': ['s500'],
		etanol: ['etanol']
	};

	for (const termos of Object.values(produtoMap)) {
		if (termos.includes(filtroNorm)) {
			return termos.some(termo => entryNorm.includes(termo));
		}
	}

	return entryNorm.includes(filtroNorm);
}

function _normalizeDecimalString(s) {
	if (s === null || s === undefined) return '0';
	s = String(s).trim();
	if (s === '') return '0';
	// remove currency symbols and letters
	s = s.replace(/[R$£€¥₹]|[a-zA-Z]+/g, '');
	// keep only digits, separators and sign
	s = s.replace(/[^0-9+\-.,]/g, '');
	if (s === '') return '0';
	// treat comma as decimal separator
	if (s.indexOf(',') !== -1) {
		s = s.replace(/,/g, '.');
	}
	const dots = (s.match(/\./g) || []).length;
	if (dots > 1) {
		const lastIndex = s.lastIndexOf('.');
		const intPart = s.slice(0, lastIndex).replace(/\./g, '');
		s = intPart + '.' + s.slice(lastIndex + 1);
	}
	if (!/^[+-]?\d*(?:\.\d*)?$/.test(s)) return '0';
	let sign = '';
	if (s[0] === '+') s = s.slice(1);
	if (s[0] === '-') { sign = '-'; s = s.slice(1); }
	s = s.replace(/^0+(?=\d|\.)/, '');
	if (s[0] === '.') s = '0' + s;
	if (s === '') s = '0';
	return sign + s;
}

function applyBulkValor() {
	const v = document.getElementById('bulkValor').value || '';
	const novo = _normalizeDecimalString(v);
	if (v.trim() === '') { alert('Informe o novo valor por litro.'); return; }

	let any = false;
	entries.forEach(entry => {
		if (entry.removed) return;
		if (!entry.selected) return;
		entry.valorNorm = novo;
		entry.totalStr = multiplyDecimalStrings(entry.litrosStr, entry.valorNorm);
		any = true;
	});
	if (!any) { alert('Nenhuma linha selecionada.'); return; }
	const chk = document.getElementById('selectAllCheckbox'); if (chk) chk.checked = false;
	renderTable();
}

function applyFilters() {
	activeFilters.unidade = document.getElementById('filterUnidade').value || '';
	activeFilters.distribuidora = document.getElementById('filterDistribuidora').value || '';
	activeFilters.produto = document.getElementById('filterProduto').value || '';
	renderTable();
}

function clearFilters() {
	activeFilters = { unidade: '', distribuidora: '', produto: '' };
	const fu = document.getElementById('filterUnidade');
	const fd = document.getElementById('filterDistribuidora');
	const fp = document.getElementById('filterProduto');
	if (fu) fu.value = '';
	if (fd) fd.value = '';
	if (fp) {
		try { fp.selectedIndex = 0; } catch (e) { fp.value = ''; }
	}
	renderTable();
	saveState();
	console.log('clearFilters: filters cleared');
}

function clearAllCargas() {
	if (!confirm('Confirma apagar todas as cargas da aba principal? Esta ação não afeta o Boleto nem o Resumo de Volume.')) return;
	// remove apenas as entradas principais (entries)
	entries = [];
	// Do not reset boletos, resumoVolumeRows or entryIdCounter to avoid id collisions on subsequent adds
	renderTable();
	saveState();
	alert('Todas as cargas da aba principal foram removidas.');
	console.log('clearAllCargas: entries cleared');
}

// (restored backup functions are below)

function _splitIntScale(s) {
	s = _normalizeDecimalString(s);
	let sign = '';
	if (s[0] === '-') { sign = '-'; s = s.slice(1); }
	const parts = s.split('.');
	const intPart = parts[0] || '0';
	const fracPart = parts[1] || '';
	const intStr = (intPart + fracPart).replace(/^0+(?!$)/, '') || '0';
	const scale = fracPart.length;
	return { sign, intStr, scale };
}

function _padRight(str, n) { while (str.length < n) str = '0' + str; return str; }

function multiplyDecimalStrings(a, b) {
	const A = _splitIntScale(a);
	const B = _splitIntScale(b);
	const aInt = BigInt(A.intStr);
	const bInt = BigInt(B.intStr);
	const prod = aInt * bInt;
	const scale = A.scale + B.scale;
	let prodStr = prod.toString();
	if (scale === 0) {
		return (A.sign === '-' ^ B.sign === '-') ? '-' + prodStr : prodStr;
	}
	// ensure string has at least scale+1 chars to place decimal point
	if (prodStr.length <= scale) prodStr = prodStr.padStart(scale + 1, '0');
	const intPart = prodStr.slice(0, prodStr.length - scale);
	const fracPart = prodStr.slice(prodStr.length - scale).replace(/0+$/,'');
	const sign = (A.sign === '-' ^ B.sign === '-') ? '-' : '';
	return sign + (fracPart ? intPart + '.' + fracPart : intPart);
}

function addDecimalStrings(a, b) {
	const A = _splitIntScale(a);
	const B = _splitIntScale(b);
	const scale = Math.max(A.scale, B.scale);
	const aInt = BigInt(A.intStr) * BigInt(10 ** (scale - A.scale));
	const bInt = BigInt(B.intStr) * BigInt(10 ** (scale - B.scale));
	const aSign = A.sign === '-' ? -1n : 1n;
	const bSign = B.sign === '-' ? -1n : 1n;
	const sum = aSign * aInt + bSign * bInt;
	const sign = sum < 0 ? '-' : '';
	const abs = sum < 0 ? -sum : sum;
	let s = abs.toString();
	if (scale === 0) return sign + s;
	if (s.length <= scale) s = s.padStart(scale + 1, '0');
	const intPart = s.slice(0, s.length - scale);
	const fracPart = s.slice(s.length - scale).replace(/0+$/,'');
	return sign + (fracPart ? intPart + '.' + fracPart : intPart);
}

function _formatDecimalLocale(s) {
	s = _normalizeDecimalString(s);
	let sign = '';
	if (s[0] === '-') { sign = '-'; s = s.slice(1); }
	const parts = s.split('.');
	let intPart = parts[0] || '0';
	const fracPart = parts[1] || '';
	// add thousands separator '.' for pt-BR
	intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
	return sign + (fracPart ? intPart + ',' + fracPart : intPart);
}

function formatarMoedaFromDecimalString(s) {
	return 'R$ ' + _formatDecimalLocale(s);
}

function formatNumberFromDecimalString(s) {
	return _formatDecimalLocale(s);
}

function adicionarCarga() {
	const unidade = document.getElementById('unidade').value.trim();
	const data = document.getElementById('data').value.trim();
	const etiqueta = document.getElementById('etiqueta').value;
	const distribuidora = document.getElementById('distribuidora').value.trim();
	const produto = document.getElementById('produto').value;
	const volumeStrRaw = document.getElementById('volume').value.trim();
	const valorStrRaw = document.getElementById('valor').value.trim();

	if (!unidade || !data || !distribuidora || !volumeStrRaw || !valorStrRaw) {
		alert('Preencha todos os campos!');
		return;
	}

	if (!isValidMonthDay(data)) {
		alert('Informe a data no formato MM/DD.');
		return;
	}

	adicionarCargaComDados(unidade, data, etiqueta, distribuidora, produto, volumeStrRaw, valorStrRaw);

	document.getElementById('volume').value = '';
	document.getElementById('valor').value = '';
	document.getElementById('data').value = '';
	document.getElementById('etiqueta').value = '';
}

function isValidMonthDay(value) {
	const match = /^([0-1][0-9])\/([0-3][0-9])$/.exec(value);
	if (!match) return false;
	const month = Number(match[1]);
	const day = Number(match[2]);
	if (month < 1 || month > 12) return false;
	const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
	return day >= 1 && day <= daysInMonth[month - 1];
}

function removerLinhaById(id) {
	const idx = entries.findIndex(e => String(e.id) === String(id));
	if (idx === -1) return;
	entries[idx].removed = true;
	renderTable();
}

function renderTable() {
	const tbody = document.querySelector('#tabela tbody');
	tbody.innerHTML = '';
	let totalVisible = '0';
	const fUnidade = (activeFilters.unidade || '').toLowerCase().trim();
	const fDistrib = (activeFilters.distribuidora || '').toLowerCase().trim();
	const fProd = (activeFilters.produto || '').toLowerCase().trim();

	entries.forEach(entry => {
		if (entry.removed) return;
		if (fUnidade && !String(entry.unidade || '').toLowerCase().includes(fUnidade)) return;
		if (fDistrib && !String(entry.distribuidora || '').toLowerCase().includes(fDistrib)) return;
		if (!produtoFiltra(entry.produto, fProd)) return;

		const row = tbody.insertRow();
		row.innerHTML = `
			<td><input type="checkbox" data-entry-id="${entry.id}" onchange="toggleSelectEntry('${entry.id}', this.checked)" ${entry.selected ? 'checked' : ''}></td>
			<td>${entry.unidade}</td>
			<td><select onchange="setEntryLabel('${entry.id}', this.value)">
				<option value="" ${entry.etiqueta === '' ? 'selected' : ''}>Nenhuma</option>
				<option value="Hoje" ${entry.etiqueta === 'Hoje' ? 'selected' : ''}>Hoje</option>
				<option value="Ontem" ${entry.etiqueta === 'Ontem' ? 'selected' : ''}>Ontem</option>
				<option value="Antes de Ontem" ${entry.etiqueta === 'Antes de Ontem' ? 'selected' : ''}>Antes de Ontem</option>
				<option value="Amanhã" ${entry.etiqueta === 'Amanhã' ? 'selected' : ''}>Amanhã</option>
			</select></td>
			<td>${entry.data || ''}</td>
			<td>${entry.distribuidora}</td>
			<td>${entry.produto}</td>
			<td>${entry.volumeNorm}</td>
			<td>${formatNumberFromDecimalString(entry.litrosStr)}</td>
			<td>${formatarMoedaFromDecimalString(entry.valorNorm)}</td>
			<td>${formatarMoedaFromDecimalString(entry.totalStr)}</td>
			<td style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;"><button class="delete-btn" style="background:#10b981;" onclick="moverParaBoleto('${entry.id}')">Boleto</button><button class="delete-btn" style="background:#f59e0b;" onclick="editValorById('${entry.id}')">Editar</button><button class="delete-btn" onclick="removerLinhaById('${entry.id}')">Excluir</button></td>
		`;

		totalVisible = addDecimalStrings(totalVisible, entry.totalStr);
	});

	document.getElementById('totalGeral').innerText = formatarMoedaFromDecimalString(totalVisible);
	renderVolumeSummary();
	saveState();
}

function setEntryLabel(id, label) {
	const entry = entries.find(e => String(e.id) === String(id));
	if (!entry) return;
	entry.etiqueta = String(label || '');
	renderTable();
}

function editValorById(id) {
	const selectedEntries = entries.filter(e => !e.removed && e.selected);
	const targetEntries = selectedEntries.length > 0 ? selectedEntries : [entries.find(e => String(e.id) === String(id))].filter(Boolean);
	if (!targetEntries.length) return alert('Registro não encontrado');
	const current = targetEntries[0].valorNorm;
	const input = prompt('Informe o novo Valor por litro para os itens selecionados (use ponto para decimais):', current);
	if (input === null) return; // cancelou
	const novo = _normalizeDecimalString(String(input));
	if (novo === '0' && String(input).trim() !== '0') { alert('Valor inválido'); return; }

	targetEntries.forEach(entry => {
		entry.valorNorm = novo;
		entry.totalStr = multiplyDecimalStrings(entry.litrosStr, entry.valorNorm);
	});
	renderTable();
}

function inserirLinhaNaTabela(id, unidade, distribuidora, produto, volumeNorm, litrosStr, valorNorm, totalStr) {
	const tbody = document.querySelector('#tabela tbody');
	const row = tbody.insertRow();

	row.innerHTML = `
		<td>${unidade}</td>
		<td>${distribuidora}</td>
		<td>${produto}</td>
		<td>${volumeNorm}</td>
		<td>${formatNumberFromDecimalString(litrosStr)}</td>
		<td>${formatarMoedaFromDecimalString(valorNorm)}</td>
		<td>${formatarMoedaFromDecimalString(totalStr)}</td>
		<td><button class="delete-btn" onclick="removerLinhaById('${id}')">Excluir</button></td>
	`;
}

function adicionarCargaComDados(unidade, data, etiqueta, distribuidora, produto, volumeStrRaw, valorStrRaw) {
	const volumeNorm = _normalizeDecimalString(String(volumeStrRaw));
	const valorNorm = _normalizeDecimalString(String(valorStrRaw));

	const litrosStr = multiplyDecimalStrings(volumeNorm, '1000');
	const totalStr = multiplyDecimalStrings(litrosStr, valorNorm);

	const entry = {
		id: entryIdCounter++,
		unidade: String(unidade),
		etiqueta: String(etiqueta || ''),
		data: String(data),
		distribuidora: String(distribuidora),
		produto: String(produto),
		volumeNorm,
		litrosStr,
		valorNorm,
		totalStr,
		removed: false,
		selected: false
	};

	entries.push(entry);
	renderTable();
}

function adicionarCargaBoleto() {
	const unidade = document.getElementById('boletoUnidade').value.trim();
	const etiqueta = document.getElementById('boletoEtiqueta').value;
	const distribuidora = document.getElementById('boletoDistribuidora').value.trim();
	const produto = document.getElementById('boletoProduto').value;
	const volumeStrRaw = document.getElementById('boletoVolume').value.trim();
	const valorStrRaw = document.getElementById('boletoValor').value.trim();

	if (!unidade || !distribuidora || !volumeStrRaw || !valorStrRaw) {
		alert('Preencha todos os campos do boleto.');
		return;
	}

	const volumeNorm = _normalizeDecimalString(String(volumeStrRaw));
	const valorNorm = _normalizeDecimalString(String(valorStrRaw));
	const litrosStr = multiplyDecimalStrings(volumeNorm, '1000');
	const totalStr = multiplyDecimalStrings(litrosStr, valorNorm);

	boletos.push({
		id: entryIdCounter++,
		unidade: String(unidade),
		etiqueta: String(etiqueta || ''),
		data: '',
		distribuidora: String(distribuidora),
		produto: String(produto),
		selected: false,
		volumeNorm,
		litrosStr,
		valorNorm,
		totalStr
	});

	document.getElementById('boletoUnidade').value = '';
	document.getElementById('boletoEtiqueta').value = '';
	document.getElementById('boletoDistribuidora').value = '';
	document.getElementById('boletoProduto').value = 'GC';
	document.getElementById('boletoVolume').value = '';
	document.getElementById('boletoValor').value = '';

	renderTabelaBoleto();
}

function importarPlanilha() {
	const input = document.getElementById('fileInput');
	if (!input || !input.files || input.files.length === 0) { alert('Escolha um arquivo primeiro.'); return; }
	const file = input.files[0];
	const reader = new FileReader();
	reader.onload = function(e) {
		try {
			const data = new Uint8Array(e.target.result);
			const workbook = XLSX.read(data, { type: 'array' });
			const firstSheet = workbook.SheetNames[0];
			const sheet = workbook.Sheets[firstSheet];
			const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });

			let added = 0;
			let skipped = 0;
			const sample = [];

			json.forEach((row, rowIndex) => {
				const keys = Object.keys(row);
				const map = {};
				keys.forEach(k => { map[k.toLowerCase().trim()] = row[k]; });

				function findVal(names) {
					for (const n of names) {
						if (Object.prototype.hasOwnProperty.call(map, n)) return map[n];
					}
					for (const k of keys) {
						if (names.includes(k.toLowerCase().trim())) return row[k];
					}
					return undefined;
				}

				const unidade = findVal(['unidade','unit','unit name','estabelecimento','estação','station']) || (Object.values(row)[0] || '');
				const distribuidora = findVal(['distribuidora','distributor','fornecedor','supplier']) || (Object.values(row)[1] || '');
				const produto = findVal(['produto','product','produto/serviço','material']) || (Object.values(row)[2] || '');
				let volume = findVal(['volume','vol','quantidade','qtd','volume (m)','volume m']);
				let valor = findVal(['valor','price','preco','preço','valor por litro','valor litro','valor/l','valor_l','valor unitario','valor unitário','preco unitario','preço unitário','valor_litro']);

				// Fallback: se não encontrou volume/valor por nome, tenta detectar colunas numéricas
				function isNumericLike(v) {
					if (v === null || v === undefined) return false;
					const s = String(v).trim();
					if (s === '') return false;
					return /[0-9]/.test(s);
				}

				if ((volume === undefined || String(volume).trim() === '') || (valor === undefined || String(valor).trim() === '')) {
					const vals = Object.values(row).map(v => String(v).trim());
					const numericIdx = [];
					vals.forEach((v, i) => { if (isNumericLike(v)) numericIdx.push(i); });
					// se encontrar pelo menos 2 colunas numéricas, assume as duas últimas como volume e valor
					if (numericIdx.length >= 2) {
						const last = numericIdx[numericIdx.length-1];
						const penult = numericIdx[numericIdx.length-2];
						// heurística: se a última tem vírgula/decimal com duas casas, pode ser valor
						valor = valor || vals[last];
						volume = volume || vals[penult];
					}
				}

				// se ainda estiver vazio, tenta colunas por posição padrão
				volume = (volume !== undefined && volume !== null && String(volume).trim() !== '') ? volume : (Object.values(row)[3] || '');
				valor = (valor !== undefined && valor !== null && String(valor).trim() !== '') ? valor : (Object.values(row)[4] || '');

				if (String(volume).trim() === '' || String(valor).trim() === '') {
					skipped++;
					if (sample.length < 5) sample.push({ row: rowIndex+1, parsed: { unidade, distribuidora, produto, volume, valor }, raw: row });
					return;
				}

				adicionarCargaComDados(String(unidade), '', '', String(distribuidora), String(produto), String(volume), String(valor));
				added++;
			});

			console.log('Import finished. added=', added, 'skipped=', skipped);
			console.log('entries length after import (preview 5):', entries.length, entries.slice(0,5));
			// force a full render and save in case previous renders were skipped
			renderTable();
			saveState();
			if (added === 0) {
				let msg = 'Nenhuma linha importada.';
				if (skipped > 0) msg += ' Linhas puladas: ' + skipped + '. Veja console para amostra.';
				alert(msg);
			} else {
				alert('Importação concluída. Linhas adicionadas: ' + added + (skipped ? (', puladas: ' + skipped) : ''));
			}
			if (sample.length) console.warn('Amostra de linhas puladas:', sample);
		} catch (err) {
			console.error(err);
			alert('Erro ao ler a planilha: ' + err.message);
		}
	};
	reader.readAsArrayBuffer(file);
}

function importarResumoVolume() {
	const input = document.getElementById('fileInputResumo');
	if (!input || !input.files || input.files.length === 0) { alert('Escolha um arquivo de resumo primeiro.'); return; }
	const file = input.files[0];
	const reader = new FileReader();
	reader.onload = function(e) {
		try {
			const data = new Uint8Array(e.target.result);
			const workbook = XLSX.read(data, { type: 'array' });
			const firstSheet = workbook.SheetNames[0];
			const sheet = workbook.Sheets[firstSheet];
			const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });

			resumoVolumeRows = [];
			json.forEach((row) => {
				const keys = Object.keys(row);
				const map = {};
				keys.forEach(k => { map[k.toLowerCase().trim()] = row[k]; });

				function findVal(names) {
					for (const n of names) {
						if (Object.prototype.hasOwnProperty.call(map, n)) return map[n];
					}
					for (const k of keys) {
						if (names.includes(k.toLowerCase().trim())) return row[k];
					}
					return undefined;
				}

				const unidade = findVal(['unidade','unit','station','estabelecimento','estação']) || (Object.values(row)[0] || '');
				const produto = findVal(['produto','product','produto/serviço','material']) || (Object.values(row)[1] || '');
				const total = findVal(['total','valor','volume','qtd','quantidade']) || (Object.values(row)[2] || '0');
				if (!String(unidade).trim() || !String(produto).trim() || String(total).trim() === '') return;

				resumoVolumeRows.push({
					unidade: String(unidade).trim(),
					produto: String(produto).trim(),
					total: _normalizeDecimalString(String(total))
				});
			});

			renderResumoVolumeTable();
			saveState();
		} catch (err) {
			console.error(err);
			alert('Erro ao ler o resumo: ' + err.message);
		}
	};
	reader.readAsArrayBuffer(file);
}

function renderResumoVolumeTable() {
	const table = document.querySelector('#tabelaResumoVolume');
	if (!table) {
		renderVolumeSummary();
		return;
	}

	const tbody = table.querySelector('tbody');
	tbody.innerHTML = '';
	if (!resumoVolumeRows.length) {
		const row = tbody.insertRow();
		row.innerHTML = '<td colspan="3" style="text-align:center; color: var(--muted);">Nenhum resumo importado ainda.</td>';
		return;
	}

	resumoVolumeRows.forEach((item, index) => {
		const row = tbody.insertRow();
		row.innerHTML = `
			<td>${item.unidade}</td>
			<td>${item.produto}</td>
			<td>${formatNumberFromDecimalString(item.total)}</td>
		`;
	});
}

function exportResumoVolumeImportToCsv() {
	if (!resumoVolumeRows.length) { alert('Não há resumo importado para exportar.'); return; }
	const header = ['Unidade','Produto','Total'].join(';');
	const csv = [header].concat(resumoVolumeRows.map(item => [
		item.unidade,
		item.produto,
		formatNumberFromDecimalString(item.total)
	].map(value => '"' + String(value).replace(/"/g, '""') + '"').join(';'))).join('\r\n');
	const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = 'wk_compras_resumo_volume_import.csv';
	a.click();
	URL.revokeObjectURL(url);
}

function exportResumoVolumeImportToExcel() {
	if (!resumoVolumeRows.length) { alert('Não há resumo importado para exportar.'); return; }
	const worksheetRows = resumoVolumeRows.map(item => ({
		Unidade: item.unidade,
		Produto: item.produto,
		Total: formatNumberFromDecimalString(item.total)
	}));
	const worksheet = XLSX.utils.json_to_sheet(worksheetRows);
	const workbook = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(workbook, worksheet, 'Resumo Volume Import');
	XLSX.writeFile(workbook, 'wk_compras_resumo_volume_import.xlsx');
}

function limparResumoVolume() {
	resumoVolumeRows = [];
	const fileInput = document.getElementById('fileInputResumo');
	if (fileInput) fileInput.value = '';
	renderVolumeSummary();
	saveState();
}

function exportBackup() {
	const state = {
		entries,
		boletos,
		entryIdCounter,
		activeFilters
	};
	const json = JSON.stringify(state, null, 2);
	const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = 'wk_compras_backup.json';
	a.click();
	URL.revokeObjectURL(url);
}

function handleBackupImport(input) {
	if (!input.files || input.files.length === 0) return;
	const file = input.files[0];
	const reader = new FileReader();
	reader.onload = function(e) {
		try {
			const state = JSON.parse(e.target.result);
			if (state && Array.isArray(state.entries) && Array.isArray(state.boletos)) {
				entries = state.entries.map(entry => ({ etiqueta: '', ...entry }));
				boletos = state.boletos.map(boleto => ({ etiqueta: '', ...boleto }));
				entryIdCounter = typeof state.entryIdCounter === 'number' && state.entryIdCounter > 0 ? state.entryIdCounter : entryIdCounter;
				activeFilters = state.activeFilters || activeFilters;
				if (document.getElementById('filterUnidade')) document.getElementById('filterUnidade').value = activeFilters.unidade || '';
				if (document.getElementById('filterDistribuidora')) document.getElementById('filterDistribuidora').value = activeFilters.distribuidora || '';
				if (document.getElementById('filterProduto')) document.getElementById('filterProduto').value = activeFilters.produto || '';
				renderTable();
				renderTabelaBoleto();
				alert('Backup restaurado com sucesso.');
			} else {
				alert('Arquivo de backup inválido.');
			}
		} catch (err) {
			console.error(err);
			alert('Erro ao restaurar backup: ' + err.message);
		}
	};
	reader.readAsText(file);
	input.value = '';
}

function getVisibleEntries() {
	const fUnidade = (activeFilters.unidade || '').toLowerCase().trim();
	const fDistrib = (activeFilters.distribuidora || '').toLowerCase().trim();
	const fProd = (activeFilters.produto || '').toLowerCase().trim();
	return entries.filter(entry => {
		if (entry.removed) return false;
		if (fUnidade && !String(entry.unidade || '').toLowerCase().includes(fUnidade)) return false;
		if (fDistrib && !String(entry.distribuidora || '').toLowerCase().includes(fDistrib)) return false;
		if (!produtoFiltra(entry.produto, fProd)) return false;
		return true;
	});
}

function exportToCsv() {
	const groups = {};
	getVisibleEntries().forEach(entry => {
		const key = `${entry.distribuidora}|||${entry.unidade}`;
		if (!groups[key]) {
			groups[key] = {
				Distribuidora: entry.distribuidora,
				Unidade: entry.unidade,
				Total: '0'
			};
		}
		groups[key].Total = addDecimalStrings(groups[key].Total, entry.totalStr);
	});
	const rows = Object.values(groups).map(group => ({
		Unidade: group.Unidade,
		Distribuidora: group.Distribuidora,
		Total: formatarMoedaFromDecimalString(group.Total)
	}));
	if (!rows.length) { alert('Não há dados visíveis para exportar.'); return; }
	const header = ['Distribuidora','Unidade','Total'].join(';');
	const csv = [header].concat(rows.map(row => [row.Distribuidora, row.Unidade, row.Total].map(value => '"' + String(value).replace(/"/g, '""') + '"').join(';'))).join('\r\n');
	const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = 'wk_compras_export.csv';
	a.click();
	URL.revokeObjectURL(url);
}

function exportToExcel() {
	const rows = getVisibleEntries().map(entry => ({
		Unidade: entry.unidade,
		Distribuidora: entry.distribuidora,
		Produto: entry.produto,
		'Volume (m)': entry.volumeNorm,
		Litros: formatNumberFromDecimalString(entry.litrosStr),
		'Valor/L': formatarMoedaFromDecimalString(entry.valorNorm),
		Total: formatarMoedaFromDecimalString(entry.totalStr)
	}));
	if (!rows.length) { alert('Não há dados visíveis para exportar.'); return; }
	const worksheet = XLSX.utils.json_to_sheet(rows);
	const workbook = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(workbook, worksheet, 'WK Compras');
	XLSX.writeFile(workbook, 'wk_compras_export.xlsx');
}

function moverParaBoleto(id) {
	const entry = entries.find(e => String(e.id) === String(id));
	if (!entry || entry.removed) return alert('Carga não encontrada');
	
	// Adiciona à lista de boletos
	boletos.push({
		id: entry.id,
		unidade: entry.unidade,
		etiqueta: entry.etiqueta || '',
		data: entry.data || '',
		selected: false,
		distribuidora: entry.distribuidora,
		produto: entry.produto,
		volumeNorm: entry.volumeNorm,
		litrosStr: entry.litrosStr,
		valorNorm: entry.valorNorm,
		totalStr: entry.totalStr
	});
	
	// Remove da tabela principal
	entry.removed = true;
	
	renderTable();
	renderTabelaBoleto();
}

function applyBoletoFilters() {
	boletoFilters.unidade = document.getElementById('filterBoletoUnidade').value || '';
	boletoFilters.distribuidora = document.getElementById('filterBoletoDistribuidora').value || '';
	boletoFilters.produto = document.getElementById('filterBoletoProduto').value || '';
	renderTabelaBoleto();
	saveState();
}

function clearBoletoFilters() {
	boletoFilters = { unidade: '', distribuidora: '', produto: '' };
	const fu = document.getElementById('filterBoletoUnidade');
	const fd = document.getElementById('filterBoletoDistribuidora');
	const fp = document.getElementById('filterBoletoProduto');
	if (fu) fu.value = '';
	if (fd) fd.value = '';
	if (fp) {
		try { fp.selectedIndex = 0; } catch (e) { fp.value = ''; }
	}
	renderTabelaBoleto();
	saveState();
}

function escapeHtmlAttr(value) {
	return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderTabelaBoleto() {
	const tbody = document.querySelector('#tabelaBoleto tbody');
	const msgVazia = document.getElementById('mensagemVazia');
	const totalBox = document.getElementById('totalBoletoBox');
	
	tbody.innerHTML = '';
	let totalBoleto = '0';
	const fUnidade = (boletoFilters.unidade || '').toLowerCase().trim();
	const fDistrib = (boletoFilters.distribuidora || '').toLowerCase().trim();
	const fProd = (boletoFilters.produto || '').toLowerCase().trim();
	let visibleCount = 0;
	
	boletos.forEach(boleto => {
		if (fUnidade && !String(boleto.unidade || '').toLowerCase().includes(fUnidade)) return;
		if (fDistrib && !String(boleto.distribuidora || '').toLowerCase().includes(fDistrib)) return;
		if (!produtoFiltra(boleto.produto, fProd)) return;
		visibleCount += 1;
		const row = tbody.insertRow();
		row.innerHTML = `
			<td><input type="checkbox" data-boleto-id="${boleto.id}" onchange="toggleSelectBoleto('${boleto.id}', this.checked)" ${boleto.selected ? 'checked' : ''}></td>
			<td><input type="text" value="${escapeHtmlAttr(boleto.unidade)}" onchange="setBoletoUnidade('${boleto.id}', this.value)" style="width:100%;min-width:120px;"></td>
			<td>
				<select onchange="setBoletoLabel('${boleto.id}', this.value)">
					<option value="" ${boleto.etiqueta === '' ? 'selected' : ''}>Nenhuma</option>
					<option value="Hoje" ${boleto.etiqueta === 'Hoje' ? 'selected' : ''}>Hoje</option>
					<option value="Ontem" ${boleto.etiqueta === 'Ontem' ? 'selected' : ''}>Ontem</option>
					<option value="Antes de Ontem" ${boleto.etiqueta === 'Antes de Ontem' ? 'selected' : ''}>Antes de Ontem</option>
					<option value="Amanhã" ${boleto.etiqueta === 'Amanhã' ? 'selected' : ''}>Amanhã</option>
				</select>
			</td>
			<td>${boleto.data || ''}</td>
			<td>${boleto.distribuidora}</td>
			<td>${boleto.produto}</td>
			<td>${boleto.volumeNorm}</td>
			<td>${formatNumberFromDecimalString(boleto.litrosStr)}</td>
			<td>${formatarMoedaFromDecimalString(boleto.valorNorm)}</td>
			<td>${formatarMoedaFromDecimalString(boleto.totalStr)}</td>
			<td style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;"><button class="delete-btn" style="background:#06b6d4;" onclick="desfazerBoleto('${boleto.id}')">Desfazer</button><button class="delete-btn" onclick="removerBoleto('${boleto.id}')">Excluir</button></td>
		`;
			totalBoleto = addDecimalStrings(totalBoleto, boleto.totalStr);
	});

	if (visibleCount === 0) {
		msgVazia.style.display = 'block';
		totalBox.style.display = 'none';
	} else {
		msgVazia.style.display = 'none';
		totalBox.style.display = 'block';
		document.getElementById('totalBoleto').innerText = formatarMoedaFromDecimalString(totalBoleto);
	}

	saveState();
}

function toggleSelectBoleto(id, checked) {
	const boleto = boletos.find(b => String(b.id) === String(id));
	if (!boleto) return;
	boleto.selected = Boolean(checked);
	saveState();
	renderTabelaBoleto();
}

function setBoletoUnidade(id, unidade) {
	const boleto = boletos.find(b => String(b.id) === String(id));
	if (!boleto) return;
	boleto.unidade = String(unidade || '').trim();
	saveState();
	renderTabelaBoleto();
}

function toggleSelectAllBoleto(checkbox) {
	const checked = Boolean(checkbox.checked);
	const fUnidade = (boletoFilters.unidade || '').toLowerCase().trim();
	const fDistrib = (boletoFilters.distribuidora || '').toLowerCase().trim();
	const fProd = (boletoFilters.produto || '').toLowerCase().trim();
	boletos.forEach(boleto => {
		if (fUnidade && !String(boleto.unidade || '').toLowerCase().includes(fUnidade)) return;
		if (fDistrib && !String(boleto.distribuidora || '').toLowerCase().includes(fDistrib)) return;
		if (!produtoFiltra(boleto.produto, fProd)) return;
		boleto.selected = checked;
	});
	saveState();
	renderTabelaBoleto();
}

function clearBoletoSelection() {
	boletos.forEach(b => b.selected = false);
	const chk = document.getElementById('selectAllBoletoCheckbox'); if (chk) chk.checked = false;
	saveState();
	renderTabelaBoleto();
}


function setBoletoLabel(id, label) {
	const boleto = boletos.find(b => String(b.id) === String(id));
	if (!boleto) return;
	boleto.etiqueta = String(label || '');
	saveState();
}

function desfazerBoleto(id) {
	const boletoIndex = boletos.findIndex(b => String(b.id) === String(id));
	if (boletoIndex === -1) return;
	
	boletos.splice(boletoIndex, 1);
	
	const entry = entries.find(e => String(e.id) === String(id));
	if (entry) {
		entry.removed = false;
	}
	
	renderTable();
	renderTabelaBoleto();
}

function removerBoleto(id) {
	const boletoIndex = boletos.findIndex(b => String(b.id) === String(id));
	if (boletoIndex === -1) return;
	
	boletos.splice(boletoIndex, 1);
	
	const entryIndex = entries.findIndex(e => String(e.id) === String(id));
	if (entryIndex !== -1) {
		entries[entryIndex].removed = true;
	}
	
	renderTabelaBoleto();
}

function getBoletoExportRows() {
	const groups = {};
	boletos.forEach(boleto => {
		const key = `${String(boleto.distribuidora || '').trim().toLowerCase()}|||${String(boleto.unidade || '').trim().toLowerCase()}`;
		if (!groups[key]) {
			groups[key] = {
				Distribuidora: boleto.distribuidora || '',
				Unidade: boleto.unidade || '',
				Total: '0'
			};
		}
		groups[key].Total = addDecimalStrings(groups[key].Total, boleto.totalStr || '0');
	});

	return Object.values(groups).map(group => ({
		Distribuidora: group.Distribuidora,
		Unidade: group.Unidade,
		Total: formatarMoedaFromDecimalString(group.Total)
	}));
}

function exportBoletoToCsv() {
	if (boletos.length === 0) { alert('Não há cargas no boleto para exportar.'); return; }

	const rows = getBoletoExportRows();
	if (!rows.length) { alert('Não há dados para exportar.'); return; }

	const header = ['Distribuidora','Unidade','Total'].join(';');
	const csv = [header].concat(rows.map(row => [row.Distribuidora, row.Unidade, row.Total].map(value => '"' + String(value).replace(/"/g, '""') + '"').join(';'))).join('\r\n');
	const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = 'wk_boletos_export.csv';
	a.click();
	URL.revokeObjectURL(url);
}

function exportBoletoToExcel() {
	if (boletos.length === 0) { alert('Não há cargas no boleto para exportar.'); return; }
	
	const rows = getBoletoExportRows();
	if (!rows.length) { alert('Não há dados para exportar.'); return; }
	
	const worksheet = XLSX.utils.json_to_sheet(rows);
	const workbook = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(workbook, worksheet, 'WK Boletos');
	XLSX.writeFile(workbook, 'wk_boletos_export.xlsx');
}

function _normalizeProductForResumo(produto) {
	const cleaned = String(produto || '').toLowerCase().replace(/[^a-z0-9]/g, '');
	if (['gc','gasolinacomum','gasolinacommum','gc - gasolinacomum'].includes(cleaned)) return 'GC';
	if (['gad','gasolinaaditivada','gasolina aditivada','gad - gasolinaaditivada'].includes(cleaned)) return 'GAD';
	if (['etanol','etânol','etanol-'].includes(cleaned)) return 'ETANOL';
	if (['s500','s-500','s 500'].includes(cleaned)) return 'S-500';
	if (['s10','s-10','s 10'].includes(cleaned)) return 'S-10';
	return 'OUTRO';
}

function getVolumeSummaryRows() {
	const groups = {};
	const productKeys = ['GC', 'GAD', 'ETANOL', 'S-500', 'S-10'];

	resumoVolumeRows.forEach(entry => {
		const unidade = String(entry.unidade || 'Sem Unidade').trim();
		const productKey = _normalizeProductForResumo(entry.produto);
		if (!groups[unidade]) {
			groups[unidade] = { Unidade: unidade, GC: '0', GAD: '0', ETANOL: '0', 'S-500': '0', 'S-10': '0', Total: '0' };
		}
		const amount = String(entry.total || '0');
		if (productKeys.includes(productKey)) {
			groups[unidade][productKey] = addDecimalStrings(groups[unidade][productKey], amount);
		} else {
			groups[unidade]['GC'] = addDecimalStrings(groups[unidade]['GC'], amount);
		}
		groups[unidade].Total = addDecimalStrings(groups[unidade].Total, amount);
	});

	return Object.values(groups).sort((a, b) => a.Unidade.localeCompare(b.Unidade, 'pt-BR', { numeric: true }));
}

function renderVolumeSummary() {
	const tbody = document.querySelector('#resumoTabela tbody');
	const rows = getVolumeSummaryRows();
	tbody.innerHTML = '';
	let totalGC = '0';
	let totalGAD = '0';
	let totalETANOL = '0';
	let totalS500 = '0';
	let totalS10 = '0';
	let totalGeral = '0';

	if (!rows.length) {
		const row = tbody.insertRow();
		row.innerHTML = '<td colspan="7" style="text-align:center; color: var(--muted);">Nenhuma carga disponível para gerar o resumo.</td>';
	} else {
		rows.forEach(item => {
			const row = tbody.insertRow();
			row.innerHTML = `
				<td>${item.Unidade}</td>
				<td>${formatNumberFromDecimalString(item.GC)}</td>
				<td>${formatNumberFromDecimalString(item.GAD)}</td>
				<td>${formatNumberFromDecimalString(item.ETANOL)}</td>
				<td>${formatNumberFromDecimalString(item['S-500'])}</td>
				<td>${formatNumberFromDecimalString(item['S-10'])}</td>
				<td>${formatNumberFromDecimalString(item.Total)}</td>
			`;

			totalGC = addDecimalStrings(totalGC, item.GC);
			totalGAD = addDecimalStrings(totalGAD, item.GAD);
			totalETANOL = addDecimalStrings(totalETANOL, item.ETANOL);
			totalS500 = addDecimalStrings(totalS500, item['S-500']);
			totalS10 = addDecimalStrings(totalS10, item['S-10']);
			totalGeral = addDecimalStrings(totalGeral, item.Total);
		});
	}

	document.getElementById('resumoTotalGC').innerText = formatNumberFromDecimalString(totalGC);
	document.getElementById('resumoTotalGAD').innerText = formatNumberFromDecimalString(totalGAD);
	document.getElementById('resumoTotalETANOL').innerText = formatNumberFromDecimalString(totalETANOL);
	document.getElementById('resumoTotalS500').innerText = formatNumberFromDecimalString(totalS500);
	document.getElementById('resumoTotalS10').innerText = formatNumberFromDecimalString(totalS10);
	document.getElementById('resumoTotalGeralResumo').innerText = formatNumberFromDecimalString(totalGeral);
}

function exportVolumeResumoToCsv() {
	const rows = getVolumeSummaryRows();
	if (!rows.length) { alert('Não há dados para exportar.'); return; }
	const header = ['Unidade','Gasolina Comum','Gasolina Aditivada','Etanol','S-500','S-10','Total'].join(';');
	const csv = [header].concat(rows.map(item => [
		item.Unidade,
		formatNumberFromDecimalString(item.GC),
		formatNumberFromDecimalString(item.GAD),
		formatNumberFromDecimalString(item.ETANOL),
		formatNumberFromDecimalString(item['S-500']),
		formatNumberFromDecimalString(item['S-10']),
		formatNumberFromDecimalString(item.Total)
	].map(value => '"' + String(value).replace(/"/g, '""') + '"').join(';'))).join('\r\n');
	const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = 'wk_compras_resumo_volume.csv';
	a.click();
	URL.revokeObjectURL(url);
}

function exportVolumeResumoToExcel() {
	const rows = getVolumeSummaryRows();
	if (!rows.length) { alert('Não há dados para exportar.'); return; }
	const worksheetRows = rows.map(item => ({
		Unidade: item.Unidade,
		'Gasolina Comum': formatNumberFromDecimalString(item.GC),
		'Gasolina Aditivada': formatNumberFromDecimalString(item.GAD),
		Etanol: formatNumberFromDecimalString(item.ETANOL),
		'S-500': formatNumberFromDecimalString(item['S-500']),
		'S-10': formatNumberFromDecimalString(item['S-10']),
		Total: formatNumberFromDecimalString(item.Total)
	}));
	const worksheet = XLSX.utils.json_to_sheet(worksheetRows);
	const workbook = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(workbook, worksheet, 'Resumo Volume');
	XLSX.writeFile(workbook, 'wk_compras_resumo_volume.xlsx');
}

window.addEventListener('beforeunload', function (event) {
	if (entries.length > 0 || boletos.length > 0) {
		event.preventDefault();
		event.returnValue = '';
	}
});

window.addEventListener('load', loadState);
