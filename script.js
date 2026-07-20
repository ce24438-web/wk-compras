let totalGeral = '0'; // armazenado como string decimal exata
let entries = [];
let entryIdCounter = 1;
let activeFilters = { unidade: '', distribuidora: '', produto: '' };

function saveState() {
	const state = {
		entries,
		entryIdCounter,
		activeFilters
	};
	localStorage.setItem('wkComprasState', JSON.stringify(state));
}

function loadState() {
	const raw = localStorage.getItem('wkComprasState');
	if (!raw) return;
	try {
		const state = JSON.parse(raw);
		if (Array.isArray(state.entries)) entries = state.entries.map(entry => ({ ...entry }));
		entryIdCounter = typeof state.entryIdCounter === 'number' && state.entryIdCounter > 0 ? state.entryIdCounter : entryIdCounter;
		activeFilters = state.activeFilters || activeFilters;
		if (document.getElementById('filterUnidade')) document.getElementById('filterUnidade').value = activeFilters.unidade || '';
		if (document.getElementById('filterDistribuidora')) document.getElementById('filterDistribuidora').value = activeFilters.distribuidora || '';
		if (document.getElementById('filterProduto')) document.getElementById('filterProduto').value = activeFilters.produto || '';
		renderTable();
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
		if (fUnidade && !entry.unidade.toLowerCase().includes(fUnidade)) return;
		if (fDistrib && !entry.distribuidora.toLowerCase().includes(fDistrib)) return;
		if (fProd && fProd !== '' && !entry.produto.toLowerCase().includes(fProd)) return;
		entry.selected = checked;
	});
	renderTable();
}

function clearSelection() {
	entries.forEach(e => e.selected = false);
	const chk = document.getElementById('selectAllCheckbox'); if (chk) chk.checked = false;
	renderTable();
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

function _normalizeDecimalString(s) {
	if (s === null || s === undefined) return '0';
	s = String(s).trim();
	if (s === '') return '0';
	// remove currency symbols and text
	s = s.replace(/[R$£€¥₹]|[a-zA-Z]+/g, '');
	// keep only digits, separators and sign
	s = s.replace(/[^0-9+\-.,]/g, '');
	if (s === '') return '0';
	// treat comma as decimal separator if there is no dot or if comma is last separator
	if (s.indexOf(',') !== -1) {
		// replace comma with dot, then normalize multiple dots
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
	// remove leading zeros
	s = s.replace(/^0+(?=\d|\.)/, '');
	if (s[0] === '.') s = '0' + s;
	if (s === '') s = '0';
	return sign + s;
}

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
	const distribuidora = document.getElementById('distribuidora').value.trim();
	const produto = document.getElementById('produto').value;
	const volumeStrRaw = document.getElementById('volume').value.trim();
	const valorStrRaw = document.getElementById('valor').value.trim();

	if (!unidade || !distribuidora || !volumeStrRaw || !valorStrRaw) {
		alert('Preencha todos os campos!');
		return;
	}

	adicionarCargaComDados(unidade, distribuidora, produto, volumeStrRaw, valorStrRaw);

	document.getElementById('volume').value = '';
	document.getElementById('valor').value = '';
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
		if (fUnidade && !entry.unidade.toLowerCase().includes(fUnidade)) return;
		if (fDistrib && !entry.distribuidora.toLowerCase().includes(fDistrib)) return;
		if (fProd && fProd !== '' && !entry.produto.toLowerCase().includes(fProd)) return;

		const row = tbody.insertRow();
		row.innerHTML = `
			<td><input type="checkbox" data-entry-id="${entry.id}" onchange="toggleSelectEntry('${entry.id}', this.checked)" ${entry.selected ? 'checked' : ''}></td>
			<td>${entry.unidade}</td>
			<td>${entry.distribuidora}</td>
			<td>${entry.produto}</td>
			<td>${entry.volumeNorm}</td>
			<td>${formatNumberFromDecimalString(entry.litrosStr)}</td>
			<td>${formatarMoedaFromDecimalString(entry.valorNorm)}</td>
			<td>${formatarMoedaFromDecimalString(entry.totalStr)}</td>
			<td style="display:flex;gap:8px;justify-content:center;"><button class="delete-btn" style="background:#f59e0b;" onclick="editValorById('${entry.id}')">Editar</button><button class="delete-btn" onclick="removerLinhaById('${entry.id}')">Excluir</button></td>
		`;

		totalVisible = addDecimalStrings(totalVisible, entry.totalStr);
	});

	document.getElementById('totalGeral').innerText = formatarMoedaFromDecimalString(totalVisible);
	saveState();
}

function editValorById(id) {
	const entry = entries.find(e => String(e.id) === String(id));
	if (!entry) return alert('Registro não encontrado');
	const current = entry.valorNorm;
	const input = prompt('Informe o novo Valor por litro (use ponto para decimais):', current);
	if (input === null) return; // cancelou
	const novo = _normalizeDecimalString(String(input));
	if (novo === '0' && String(input).trim() !== '0') { alert('Valor inválido'); return; }

	entry.valorNorm = novo;
	// recalcula total: litrosStr * valorNorm
	entry.totalStr = multiplyDecimalStrings(entry.litrosStr, entry.valorNorm);
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

function adicionarCargaComDados(unidade, distribuidora, produto, volumeStrRaw, valorStrRaw) {
	const volumeNorm = _normalizeDecimalString(String(volumeStrRaw));
	const valorNorm = _normalizeDecimalString(String(valorStrRaw));

	const litrosStr = multiplyDecimalStrings(volumeNorm, '1000');
	const totalStr = multiplyDecimalStrings(litrosStr, valorNorm);

	const entry = {
		id: entryIdCounter++,
		unidade: String(unidade),
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

			// process rows
			json.forEach((row) => {
				// normalize keys: find values by likely header names (case-insensitive)
				const keys = Object.keys(row);
				const map = {};
				keys.forEach(k => { map[k.toLowerCase().trim()] = row[k]; });

				function findVal(names) {
					for (const n of names) {
				if (Object.prototype.hasOwnProperty.call(map, n)) return map[n];
			}
			// try direct access by header variants
			for (const k of keys) {
				if (names.includes(k.toLowerCase().trim())) return row[k];
			}
			return undefined;
		}

		const unidade = findVal(['unidade','unit','unit name','estabelecimento','estação','station']) || (Object.values(row)[0] || '');
		const distribuidora = findVal(['distribuidora','distributor','fornecedor','supplier']) || (Object.values(row)[1] || '');
		const produto = findVal(['produto','product','produto/serviço','material']) || (Object.values(row)[2] || '');
		const volume = findVal(['volume','vol','quantidade','qtd','volume (m)','volume m']) || (Object.values(row)[3] || '0');
		const valor = findVal(['valor','price','preco','preço','valor por litro','valor litro','valor/l','valor_l','valor unitario','valor unitário','preco unitario','preço unitário','valor_litro']) || (Object.values(row)[4] || '0');
				if (String(volume).trim() === '' || String(valor).trim() === '') return;

				adicionarCargaComDados(String(unidade), String(distribuidora), String(produto), String(volume), String(valor));
			});

		} catch (err) {
			console.error(err);
			alert('Erro ao ler a planilha: ' + err.message);
		}
	};
	reader.readAsArrayBuffer(file);
}

function applyFilters() {
	const fu = document.getElementById('filterUnidade').value || '';
	const fd = document.getElementById('filterDistribuidora').value || '';
	const fp = document.getElementById('filterProduto').value || '';
	activeFilters.unidade = fu;
	activeFilters.distribuidora = fd;
	activeFilters.produto = fp;
	renderTable();
}

function clearFilters() {
	document.getElementById('filterUnidade').value = '';
	document.getElementById('filterDistribuidora').value = '';
	document.getElementById('filterProduto').value = '';
	activeFilters = { unidade: '', distribuidora: '', produto: '' };
	renderTable();
}

function getVisibleEntries() {
	const fUnidade = (activeFilters.unidade || '').toLowerCase().trim();
	const fDistrib = (activeFilters.distribuidora || '').toLowerCase().trim();
	const fProd = (activeFilters.produto || '').toLowerCase().trim();
	return entries.filter(entry => {
		if (entry.removed) return false;
		if (fUnidade && !entry.unidade.toLowerCase().includes(fUnidade)) return false;
		if (fDistrib && !entry.distribuidora.toLowerCase().includes(fDistrib)) return false;
		if (fProd && fProd !== '' && !entry.produto.toLowerCase().includes(fProd)) return false;
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

window.addEventListener('load', loadState);
