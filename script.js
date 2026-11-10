let totalGeral = '0'; // armazenado como string decimal exata
let entries = [];
let boletos = []; // novo array para cargas no boleto
let creditos = []; // novo array para acompanhamento de crédito a fornecedor
let frota = [];
let referenciasCompras = [];
let fechamentosCompras = [];
let fechamentoComprasSelecionadoId = '';
let referenciasComprasSchemaError = '';
let preenchimentoHeaders = [];
let preenchimentoRows = [];
const preenchimentoLinhasSelecionadas = new Set();
let saldoCreditoChart = null;
let resumoVolumeRows = [];
let entryIdCounter = 1;
let activeFilters = { unidade: '', distribuidora: '', produto: '', motorista: '' };
let boletoFilters = { unidade: '', distribuidora: '', produto: '', motorista: '' };
let distribChart = null;
let currentSupabaseSession = null;
let currentSupabaseProfile = null;
let currentSupabaseUser = null;
let wkSupabaseSyncController = null;
let wkSupabaseRealtimeChannel = null;
let wkSupabaseAuthInitialized = false;
let wkRemoteHydrating = false;
let wkRemoteSyncTimer = null;
let wkRemoteReloadTimer = null;
let wkRemoteSyncPending = false;
let wkRemoteSyncInFlight = false;
let wkRemoteReloadPending = false;
let wkUnitLookup = [];

const wkSupabaseClient = window.WK_SUPABASE_CLIENT || null;
const MOTORISTA_ALIASES = {
	'marcio': {
		nome: 'MARCIO DENIS DA SILVA',
		cpf: '711.178.571-15'
	}
};

const UNIDADE_CNPJ_MAP = [
	{ cnpj: '37.489.383/0003-85', aliases: ['BM PLANALTINA', 'PLANALTINA'] },
	{ cnpj: '37.489.383/0001-13', aliases: ['BM RIO VERDE - GO', 'BM RIO VERDE', 'RIO VERDE'] },
	{ cnpj: '37.489.383/0010-04', aliases: ['BM ANÁPOLIS - GO', 'BM ANAPOLIS - GO', 'BM ANAPOLIS', 'ANÁPOLIS', 'ANAPOLIS'] },
	{ cnpj: '37.489.383/0006-28', aliases: ['BM CAMPINORTE - GO', 'BM CAMPINORTE', 'CAMPINORTE'] },
	{ cnpj: '37.489.383/0007-09', aliases: ['BM NIQUELÂNDIA - GO', 'BM NIQUELANDIA - GO', 'BM NIQUELANDIA', 'NIQUELÂNDIA', 'NIQUELANDIA'] },
	{ cnpj: '05.405.388/0001-24', aliases: ['REGIONAL DERIVADOS'] },
	{ cnpj: '27.370.739/0001-41', aliases: ['JARAGUÁ - GO', 'JARAGUA - GO', 'JARAGUÁ', 'JARAGUA'] },
	{ cnpj: '37.489.383/0008-90', aliases: ['BM JATAÍ', 'BM JATAI', 'JATAÍ', 'JATAI'] },
	{ cnpj: '37.489.383/0002-02', aliases: ['BM CATALÃO - GO', 'BM CATALAO - GO', 'BM CATALAO', 'CATALÃO', 'CATALAO'] },
	{ cnpj: '37.489.383/0009-70', aliases: ['BM GOIANÉSIA - GO', 'BM GOIANESIA - GO', 'BM GOIANESIA', 'GOIANÉSIA', 'GOIANESIA'] },
	{ cnpj: '07.557.958/0001-27', aliases: ['KBW'] },
	{ cnpj: '58.889.918/0002-02', aliases: ['WK 14', 'REDE DE POSTOS WK XIV', 'REDE DE POSTOS WK 14'] },
	{ cnpj: '58.889.918/0003-85', aliases: ['REDE DE POSTOS QUERÊNCIA MT', 'REDE DE POSTOS QUERENCIA MT', 'REDE DE POSTOS WK QUERÊNCIA', 'REDE DE POSTOS WK QUERENCIA', 'QUERÊNCIA MT', 'QUERENCIA MT'] },
	{ cnpj: '37.489.383/0011-95', aliases: ['BM CENTRO'] },
	{ cnpj: '37.489.383/0012-76', aliases: ['BM QUERÊNCIA', 'BM QUERENCIA', 'QUERÊNCIA', 'QUERENCIA'] }
];

function normalizeLookupText(value) {
	return String(value || '')
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '');
}

function getKnownUnitCnpj(unidade) {
	const normalizedUnidade = normalizeLookupText(unidade);
	if (!normalizedUnidade) return '';
	const exactMatch = UNIDADE_CNPJ_MAP.find(item =>
		item.aliases.some(alias => normalizeLookupText(alias) === normalizedUnidade)
	);
	if (exactMatch) return exactMatch.cnpj;
	return '';
}

function getCnpjForUnidade(unidade) {
	const normalizedUnidade = normalizeLookupText(unidade);
	if (!normalizedUnidade) return '';
	const exactCnpj = getKnownUnitCnpj(unidade);
	if (exactCnpj) return exactCnpj;
	for (const item of UNIDADE_CNPJ_MAP) {
		if (item.aliases.some(alias => normalizedUnidade.includes(normalizeLookupText(alias)))) {
			return item.cnpj;
		}
	}
	return '';
}

function generateLocalRecordId() {
	if (window.crypto && typeof window.crypto.randomUUID === 'function') {
		return window.crypto.randomUUID();
	}
	return `wk-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeDateForDb(value) {
	const normalized = WKComprasUtils.normalizeDateValue(value);
	return normalized || null;
}

function getTodayDateString() {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

class WKComprasUtils {
	static produtoFiltra(entryProduto, filtroProduto) {
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

	static normalizeDecimalString(s) {
		if (s === null || s === undefined) return '0';
		s = String(s).trim();
		if (s === '') return '0';
		s = s.replace(/[R$£€¥₹]|[a-zA-Z]+/g, '');
		s = s.replace(/[^0-9+\-.,]/g, '');
		if (s === '') return '0';
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

	static splitIntScale(s) {
		s = WKComprasUtils.normalizeDecimalString(s);
		let sign = '';
		if (s[0] === '-') { sign = '-'; s = s.slice(1); }
		const parts = s.split('.');
		const intPart = parts[0] || '0';
		const fracPart = parts[1] || '';
		const intStr = (intPart + fracPart).replace(/^0+(?!$)/, '') || '0';
		const scale = fracPart.length;
		return { sign, intStr, scale };
	}

	static multiplyDecimalStrings(a, b) {
		const A = WKComprasUtils.splitIntScale(a);
		const B = WKComprasUtils.splitIntScale(b);
		const aInt = BigInt(A.intStr);
		const bInt = BigInt(B.intStr);
		const prod = aInt * bInt;
		const scale = A.scale + B.scale;
		let prodStr = prod.toString();
		if (scale === 0) {
			return (A.sign === '-' ^ B.sign === '-') ? '-' + prodStr : prodStr;
		}
		if (prodStr.length <= scale) prodStr = prodStr.padStart(scale + 1, '0');
		const intPart = prodStr.slice(0, prodStr.length - scale);
		const fracPart = prodStr.slice(prodStr.length - scale).replace(/0+$/,'');
		const sign = (A.sign === '-' ^ B.sign === '-') ? '-' : '';
		return sign + (fracPart ? intPart + '.' + fracPart : intPart);
	}

	static addDecimalStrings(a, b) {
		const A = WKComprasUtils.splitIntScale(a);
		const B = WKComprasUtils.splitIntScale(b);
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

	static subtractDecimalStrings(a, b) {
		return WKComprasUtils.addDecimalStrings(a, '-' + WKComprasUtils.normalizeDecimalString(String(b || '0')));
	}

	static formatDecimalLocale(s) {
		s = WKComprasUtils.normalizeDecimalString(s);
		let sign = '';
		if (s[0] === '-') { sign = '-'; s = s.slice(1); }
		const parts = s.split('.');
		let intPart = parts[0] || '0';
		const fracPart = parts[1] || '';
		intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
		return sign + (fracPart ? intPart + ',' + fracPart : intPart);
	}

	static formatMoney(s) {
		return 'R$ ' + WKComprasUtils.formatDecimalLocale(s);
	}

	static formatNumber(s) {
		return WKComprasUtils.formatDecimalLocale(s);
	}

	static extractFirstTwoNames(value) {
		const raw = String(value ?? '').trim();
		if (!raw) return '';
		const names = raw.split(/\s+/).filter(Boolean);
		if (names.length <= 2) return names.join(' ');
		return `${names[0]} ${names[1]}`;
	}

	static excelSerialToDate(serial) {
		const n = Number(serial);
		if (!Number.isFinite(n)) return '';
		const utc = Date.UTC(1899, 11, 30) + n * 86400000;
		const date = new Date(utc);
		const y = date.getUTCFullYear();
		const m = String(date.getUTCMonth() + 1).padStart(2, '0');
		const d = String(date.getUTCDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	}

	static normalizeDateValue(value) {
		if (value === null || value === undefined) return '';
		let s = String(value).trim();
		if (!s) return '';

		if (/^\d{5,}$/.test(s)) {
			const serial = Number(s);
			if (Number.isFinite(serial)) {
				const converted = WKComprasUtils.excelSerialToDate(serial);
				if (converted) return converted;
			}
		}

		if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
		if (/^\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?$/.test(s)) {
			const parts = s.split(/[\/\-]/);
			let day = Number(parts[0]);
			let month = Number(parts[1]);
			let year = parts.length >= 3 ? Number(parts[2]) : new Date().getFullYear();

			if (Number.isNaN(day) || Number.isNaN(month) || Number.isNaN(year)) return '';
			if (parts.length >= 3) {
				const normalizedYear = Number(parts[2]);
				if (Number.isFinite(normalizedYear)) year = normalizedYear;
			}
			const date = new Date(year, month - 1, day);
			if (Number.isNaN(date.getTime())) return '';
			return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
		}
		const date = new Date(s);
		if (Number.isNaN(date.getTime())) return '';
		const y = date.getFullYear();
		const m = String(date.getMonth() + 1).padStart(2, '0');
		const d = String(date.getDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	}

	static findDateValueInRow(row) {
		const values = Object.values(row || {});
		const candidates = [];
		for (const value of values) {
			if (value === null || value === undefined || String(value).trim() === '') continue;
			const s = String(value).trim();
			if (/\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?$/.test(s) || /^\d{4}-\d{2}-\d{2}$/.test(s) || /^\d{5,}$/.test(s)) {
				candidates.push(value);
			}
		}
		for (const candidate of candidates) {
			const normalized = WKComprasUtils.normalizeDateValue(candidate);
			if (normalized) return normalized;
		}
		return '';
	}

	static isValidMonthDay(value) {
		const normalized = WKComprasUtils.normalizeDateValue(value);
		if (!normalized) return false;
		const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
		if (!match) return false;
		const year = Number(match[1]);
		const month = Number(match[2]);
		const day = Number(match[3]);
		if (year < 2000 || month < 1 || month > 12) return false;
		const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
		const leapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
		const totalDays = month === 2 && leapYear ? 29 : daysInMonth[month - 1];
		return day >= 1 && day <= totalDays;
	}

	static escapeHtmlAttr(value) {
		return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}
}

class WKComprasLayoutController {
	switchTab(tabId, eventArg) {
		const allTabs = document.querySelectorAll('.tab-content');
		allTabs.forEach(tab => tab.classList.remove('active'));

		const allButtons = document.querySelectorAll('.tab-button');
		allButtons.forEach(btn => btn.classList.remove('active'));

		const selectedTab = document.getElementById(tabId);
		if (selectedTab) {
			selectedTab.classList.add('active');
		}

		const eventObj = eventArg || window.event;
		if (eventObj && eventObj.target) {
			const button = eventObj.target.closest('.tab-button');
			if (button) button.classList.add('active');
		}
	}

	toggleSidebar() {
		const sidebar = document.getElementById('sidebar');
		const toggle = document.querySelector('.sidebar-toggle');
		const overlay = document.getElementById('sidebarOverlay');
		const isMobile = window.innerWidth <= 768;

		if (sidebar && toggle) {
			const isClosed = sidebar.classList.contains('closed');

			if (isClosed) {
				sidebar.classList.remove('closed');
				toggle.classList.add('active');
				if (overlay && isMobile) overlay.classList.add('active');
				localStorage.setItem('sidebarState', 'open');
			} else {
				sidebar.classList.add('closed');
				toggle.classList.remove('active');
				if (overlay) overlay.classList.remove('active');
				localStorage.setItem('sidebarState', 'closed');
			}
		}
	}

	restoreSidebarState() {
		const sidebarState = localStorage.getItem('sidebarState');
		const sidebar = document.getElementById('sidebar');
		const toggle = document.querySelector('.sidebar-toggle');
		const overlay = document.getElementById('sidebarOverlay');
		const shouldOpen = sidebarState !== 'closed';
		const isMobile = window.innerWidth <= 768;

		if (sidebar) {
			if (shouldOpen) {
				sidebar.classList.remove('closed');
			} else {
				sidebar.classList.add('closed');
			}
		}

		if (toggle) {
			if (shouldOpen) {
				toggle.classList.add('active');
			} else {
				toggle.classList.remove('active');
			}
		}

		if (overlay) {
			if (shouldOpen && isMobile) {
				overlay.classList.add('active');
			} else {
				overlay.classList.remove('active');
			}
		}

		if (!sidebarState) {
			localStorage.setItem('sidebarState', 'open');
		}
	}

	openDistribuidorPanel() {
		const panel = document.getElementById('distribPanel');
		if (!panel) return;
		panel.style.display = 'flex';
		this.renderDistribuidorChart();
	}

	closeDistribuidorPanel() {
		const panel = document.getElementById('distribPanel');
		if (!panel) return;
		panel.style.display = 'none';
	}

	renderDistribuidorChart() {
		const canvas = document.getElementById('distribChart');
		if (!canvas) return;

		const groups = {};
		entries.forEach(entry => {
			if (entry.removed) return;
			const key = String(entry.distribuidora || 'Sem Distribuidora').trim();
			if (!groups[key]) groups[key] = '0';
			groups[key] = WKComprasUtils.addDecimalStrings(groups[key], entry.totalStr || '0');
		});

		const labels = Object.keys(groups);
		const dataValues = labels.map(l => {
			const v = groups[l] || '0';
			return parseFloat(String(v)) || 0;
		});

		const ctx = canvas.getContext('2d');

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
}

class WKComprasPersistenceController {
	saveState() {
		const state = {
			entries,
			boletos,
			creditos,
			preenchimentoHeaders,
			preenchimentoRows,
			resumoVolumeRows,
			referenciasCompras,
			entryIdCounter,
			activeFilters,
			boletoFilters
		};
		localStorage.setItem('wkComprasState', JSON.stringify(state));
	}

	loadState() {
		const raw = localStorage.getItem('wkComprasState');
		if (!raw) return;
		try {
			const state = JSON.parse(raw);
			if (Array.isArray(state.entries)) entries = state.entries.map(entry => ({ etiqueta: '', ...entry }));
			if (Array.isArray(state.boletos)) boletos = state.boletos.map(boleto => ({ etiqueta: '', selected: Boolean(boleto.selected), ...boleto }));
			if (Array.isArray(state.creditos)) creditos = state.creditos.map(item => ({ etiqueta: '', selected: Boolean(item.selected), valorPago: '0', ...item }));
			if (Array.isArray(state.preenchimentoHeaders)) preenchimentoHeaders = state.preenchimentoHeaders;
			if (Array.isArray(state.preenchimentoRows)) preenchimentoRows = state.preenchimentoRows;
			if (Array.isArray(state.referenciasCompras)) referenciasCompras = state.referenciasCompras.map(item => ({
				id: String(item.id || generateLocalRecordId()),
				unidade: String(item.unidade || ''),
				produto: String(item.produto || ''),
				valorUnitario: _normalizeDecimalString(String(item.valorUnitario ?? '0')),
				distribuidor: String(item.distribuidor || ''),
				base: String(item.base || ''),
				ativo: item.ativo !== false
			}));
			if (Array.isArray(state.resumoVolumeRows)) resumoVolumeRows = state.resumoVolumeRows.map(row => ({ unidade: '', produto: '', total: '0', ...row }));
			entryIdCounter = typeof state.entryIdCounter === 'number' && state.entryIdCounter > 0 ? state.entryIdCounter : entryIdCounter;
			activeFilters = state.activeFilters || activeFilters;
			boletoFilters = state.boletoFilters || boletoFilters;
			if (document.getElementById('filterUnidade')) document.getElementById('filterUnidade').value = activeFilters.unidade || '';
			if (document.getElementById('filterDistribuidora')) document.getElementById('filterDistribuidora').value = activeFilters.distribuidora || '';
			if (document.getElementById('filterProduto')) document.getElementById('filterProduto').value = activeFilters.produto || '';
			if (document.getElementById('filterMotorista')) document.getElementById('filterMotorista').value = activeFilters.motorista || '';
			if (document.getElementById('filterBoletoUnidade')) document.getElementById('filterBoletoUnidade').value = boletoFilters.unidade || '';
			if (document.getElementById('filterBoletoDistribuidora')) document.getElementById('filterBoletoDistribuidora').value = boletoFilters.distribuidora || '';
			if (document.getElementById('filterBoletoProduto')) document.getElementById('filterBoletoProduto').value = boletoFilters.produto || '';
			if (document.getElementById('filterBoletoMotorista')) document.getElementById('filterBoletoMotorista').value = boletoFilters.motorista || '';
			renderTable();
			renderTabelaBoleto();
			renderTabelaCredito();
			renderTabelaSaldoCredito();
			renderPreenchimentoTable();
			renderReferenciasCompras();
			renderResumoVolumeTable();
			wkComprasLayoutController.renderDistribuidorChart();
		} catch (err) {
			console.warn('Não foi possível carregar estado salvo:', err);
		}
	}
}

function buildUnitLookup(units) {
	wkUnitLookup = Array.isArray(units) ? units.map(unit => {
		const aliases = Array.isArray(unit.aliases) ? unit.aliases : [];
		return {
			...unit,
			normalizedName: normalizeLookupText(unit.nome_padrao || ''),
			normalizedAliases: [unit.nome_padrao, ...aliases].map(value => normalizeLookupText(value))
		};
	}) : [];
}

function findUnitByName(unidade) {
	const normalized = normalizeLookupText(unidade || '');
	if (!normalized || !wkUnitLookup.length) return null;
	for (const unit of wkUnitLookup) {
		if (!unit.normalizedName) continue;
		if (normalized === unit.normalizedName) return unit;
		if (unit.normalizedAliases.some(alias => alias && (normalized.includes(alias) || alias.includes(normalized)))) {
			return unit;
		}
	}
	return null;
}

function mapEntryRowToLocal(row) {
	return {
		id: String(row.legacy_local_id || row.id),
		dbId: row.id || null,
		unidade: String(row.unidade_nome_snapshot || ''),
		etiqueta: String(row.etiqueta || ''),
		data: String(row.data || ''),
		distribuidora: String(row.distribuidora || ''),
		motorista: String(row.motorista || ''),
		produto: String(row.produto || ''),
		volumeNorm: _normalizeDecimalString(String(row.volume_m3 ?? '0')),
		litrosStr: _normalizeDecimalString(String(row.litros ?? '0')),
		valorNorm: _normalizeDecimalString(String(row.valor_litro ?? '0')),
		totalStr: _normalizeDecimalString(String(row.total ?? '0')),
		removed: Boolean(row.removed),
		selected: false,
		created_by: row.created_by || null,
		updated_by: row.updated_by || null,
		created_at: row.created_at || null,
		updated_at: row.updated_at || null
	};
}

function mapBoletoRowToLocal(row) {
	return {
		id: String(row.legacy_local_id || row.id),
		dbId: row.id || null,
		source_carga_id: row.source_carga_id || null,
		unidade: String(row.unidade_nome_snapshot || ''),
		etiqueta: String(row.etiqueta || ''),
		data: String(row.data || ''),
		distribuidora: String(row.distribuidora || ''),
		motorista: String(row.motorista || ''),
		produto: String(row.produto || ''),
		volumeNorm: _normalizeDecimalString(String(row.volume_m3 ?? '0')),
		litrosStr: _normalizeDecimalString(String(row.litros ?? '0')),
		valorNorm: _normalizeDecimalString(String(row.valor_litro ?? '0')),
		totalStr: _normalizeDecimalString(String(row.total ?? '0')),
		selected: Boolean(row.selected),
		removed: Boolean(row.removed),
		created_by: row.created_by || null,
		updated_by: row.updated_by || null,
		created_at: row.created_at || null,
		updated_at: row.updated_at || null
	};
}

function mapCreditoRowToLocal(row) {
	return {
		id: String(row.legacy_local_id || row.id),
		dbId: row.id || null,
		source_carga_id: row.source_carga_id || null,
		unidade: String(row.unidade_nome_snapshot || ''),
		etiqueta: String(row.etiqueta || ''),
		data: String(row.data || ''),
		distribuidora: String(row.distribuidora || ''),
		motorista: String(row.motorista || ''),
		produtoOriginal: String(row.produto_original || ''),
		produto: String(row.novo_produto || row.produto_original || ''),
		novoProduto: String(row.novo_produto || row.produto_original || ''),
		volumeNorm: _normalizeDecimalString(String(row.volume_original ?? '0')),
		novoVolumeNorm: _normalizeDecimalString(String(row.volume_ajustado ?? row.volume_original ?? '0')),
		litrosStr: _normalizeDecimalString(String(row.litros_originais ?? '0')),
		novoLitrosStr: _normalizeDecimalString(String(row.litros_ajustados ?? row.litros_originais ?? '0')),
		valorNorm: _normalizeDecimalString(String(row.valor_original ?? '0')),
		valorPago: _normalizeDecimalString(String(row.valor_pago ?? row.total_original ?? '0')),
		novoValorNorm: _normalizeDecimalString(String(row.valor_ajustado ?? row.valor_original ?? '0')),
		totalStr: _normalizeDecimalString(String(row.total_original ?? '0')),
		novoTotalStr: _normalizeDecimalString(String(row.total_ajustado ?? row.total_original ?? '0')),
		saldo: _normalizeDecimalString(String(row.saldo ?? '0')),
		selected: Boolean(row.selected),
		removed: Boolean(row.removed),
		created_by: row.created_by || null,
		updated_by: row.updated_by || null,
		created_at: row.created_at || null,
		updated_at: row.updated_at || null
	};
}

function mapFrotaRowToLocal(row) {
	return {
		id: String(row.id || ''),
		dbId: row.id || null,
		categoria: String(row.categoria || 'FROTA'),
		veiculo: String(row.veiculo || ''),
		carreta1: String(row.carreta_1 || ''),
		carreta2: String(row.carreta_2 || ''),
		motoristaNome: String(row.motorista_nome || ''),
		motoristaCpf: String(row.motorista_cpf || ''),
		ativo: row.ativo !== false
	};
}

function mapReferenciaCompraRowToLocal(row) {
	return {
		id: String(row.id || ''),
		dbId: row.id || null,
		unidade: String(row.unidade || ''),
		produto: String(row.produto || ''),
		valorUnitario: _normalizeDecimalString(String(row.valor_unitario ?? '0')),
		distribuidor: String(row.distribuidor || ''),
		base: String(row.base || ''),
		ativo: row.ativo !== false
	};
}

function mapFechamentoCompraRowToLocal(row) {
	return {
		id: String(row.id || ''),
		dataReferencia: String(row.data_referencia || ''),
		descricao: String(row.descricao || ''),
		createdAt: row.created_at || null
	};
}

function mapReferenciaCompraItemRowToLocal(row) {
	return {
		id: String(row.id || ''),
		dbId: row.id || null,
		fechamentoId: String(row.fechamento_id || ''),
		unidade: String(row.unidade || ''),
		produto: String(row.produto || ''),
		valorUnitario: _normalizeDecimalString(String(row.valor_unitario ?? '0')),
		distribuidor: String(row.distribuidor || ''),
		base: String(row.base || ''),
		ativo: true
	};
}

function mapReferenciaCompraToRemoteRow(item) {
	return {
		id: item.dbId || undefined,
		unidade: String(item.unidade || '').trim(),
		produto: String(item.produto || '').trim(),
		valor_unitario: Number.parseFloat(_normalizeDecimalString(String(item.valorUnitario || '0'))) || 0,
		distribuidor: String(item.distribuidor || '').trim(),
		base: String(item.base || '').trim(),
		ativo: item.ativo !== false,
		created_by: item.created_by || (currentSupabaseUser ? currentSupabaseUser.id : null),
		updated_by: currentSupabaseUser ? currentSupabaseUser.id : null
	};
}

function mapEntryToRemoteRow(entry) {
	const unit = findUnitByName(entry.unidade);
	return {
		legacy_local_id: String(entry.id),
		unidade_id: unit ? unit.id : null,
		unidade_nome_snapshot: String(entry.unidade || ''),
		cnpj_snapshot: getCnpjForUnidade(entry.unidade),
		data: normalizeDateForDb(entry.data) || getTodayDateString(),
		etiqueta: String(entry.etiqueta || ''),
		distribuidora: String(entry.distribuidora || ''),
		motorista: String(entry.motorista || ''),
		produto: String(entry.produto || ''),
		volume_m3: Number.parseFloat(_normalizeDecimalString(String(entry.volumeNorm || '0'))) || 0,
		litros: Number.parseFloat(_normalizeDecimalString(String(entry.litrosStr || '0'))) || 0,
		valor_litro: Number.parseFloat(_normalizeDecimalString(String(entry.valorNorm || '0'))) || 0,
		total: Number.parseFloat(_normalizeDecimalString(String(entry.totalStr || '0'))) || 0,
		removed: Boolean(entry.removed),
		removed_at: entry.removed ? new Date().toISOString() : null,
		removed_by: entry.removed ? (currentSupabaseUser ? currentSupabaseUser.id : null) : null,
		created_by: entry.created_by || (currentSupabaseUser ? currentSupabaseUser.id : null),
		updated_by: currentSupabaseUser ? currentSupabaseUser.id : null
	};
}

function mapBoletoToRemoteRow(boleto) {
	const unit = findUnitByName(boleto.unidade);
	return {
		legacy_local_id: String(boleto.id),
		source_carga_id: boleto.source_carga_id || null,
		unidade_id: unit ? unit.id : null,
		unidade_nome_snapshot: String(boleto.unidade || ''),
		cnpj_snapshot: getCnpjForUnidade(boleto.unidade),
		data: normalizeDateForDb(boleto.data),
		etiqueta: String(boleto.etiqueta || ''),
		distribuidora: String(boleto.distribuidora || ''),
		motorista: String(boleto.motorista || ''),
		produto: String(boleto.produto || ''),
		volume_m3: Number.parseFloat(_normalizeDecimalString(String(boleto.volumeNorm || '0'))) || 0,
		litros: Number.parseFloat(_normalizeDecimalString(String(boleto.litrosStr || '0'))) || 0,
		valor_litro: Number.parseFloat(_normalizeDecimalString(String(boleto.valorNorm || '0'))) || 0,
		total: Number.parseFloat(_normalizeDecimalString(String(boleto.totalStr || '0'))) || 0,
		selected: Boolean(boleto.selected),
		removed: Boolean(boleto.removed),
		removed_at: boleto.removed ? new Date().toISOString() : null,
		removed_by: boleto.removed ? (currentSupabaseUser ? currentSupabaseUser.id : null) : null,
		created_by: boleto.created_by || (currentSupabaseUser ? currentSupabaseUser.id : null),
		updated_by: currentSupabaseUser ? currentSupabaseUser.id : null
	};
}

function mapCreditoToRemoteRow(item) {
	const unit = findUnitByName(item.unidade);
	return {
		legacy_local_id: String(item.id),
		source_carga_id: item.source_carga_id || null,
		unidade_id: unit ? unit.id : null,
		unidade_nome_snapshot: String(item.unidade || ''),
		cnpj_snapshot: getCnpjForUnidade(item.unidade),
		data: normalizeDateForDb(item.data),
		etiqueta: String(item.etiqueta || ''),
		distribuidora: String(item.distribuidora || ''),
		motorista: String(item.motorista || ''),
		produto_original: String(item.produtoOriginal || item.produto || ''),
		novo_produto: String(item.novoProduto || item.produto || item.produtoOriginal || ''),
		volume_original: Number.parseFloat(_normalizeDecimalString(String(item.volumeNorm || '0'))) || 0,
		volume_ajustado: Number.parseFloat(_normalizeDecimalString(String(item.novoVolumeNorm || item.volumeNorm || '0'))) || 0,
		litros_originais: Number.parseFloat(_normalizeDecimalString(String(item.litrosStr || '0'))) || 0,
		litros_ajustados: Number.parseFloat(_normalizeDecimalString(String(item.novoLitrosStr || item.litrosStr || '0'))) || 0,
		valor_original: Number.parseFloat(_normalizeDecimalString(String(item.valorNorm || '0'))) || 0,
		valor_pago: Number.parseFloat(_normalizeDecimalString(String(item.valorPago || item.totalStr || '0'))) || 0,
		valor_ajustado: Number.parseFloat(_normalizeDecimalString(String(item.novoValorNorm || item.valorNorm || '0'))) || 0,
		total_original: Number.parseFloat(_normalizeDecimalString(String(item.totalStr || '0'))) || 0,
		total_ajustado: Number.parseFloat(_normalizeDecimalString(String(item.novoTotalStr || item.totalStr || '0'))) || 0,
		saldo: Number.parseFloat(_normalizeDecimalString(String(getCreditoSaldo(item) || '0'))) || 0,
		selected: Boolean(item.selected),
		removed: Boolean(item.removed),
		removed_at: item.removed ? new Date().toISOString() : null,
		removed_by: item.removed ? (currentSupabaseUser ? currentSupabaseUser.id : null) : null,
		created_by: item.created_by || (currentSupabaseUser ? currentSupabaseUser.id : null),
		updated_by: currentSupabaseUser ? currentSupabaseUser.id : null
	};
}

class WKComprasSupabaseSyncController {
	constructor(client) {
		this.client = client;
	}

	isReady() {
		return Boolean(this.client && currentSupabaseUser);
	}

	queueSync() {
		if (!this.isReady() || wkRemoteHydrating) return;
		wkRemoteSyncPending = true;
		if (wkRemoteSyncTimer) clearTimeout(wkRemoteSyncTimer);
		wkRemoteSyncTimer = setTimeout(() => {
			wkRemoteSyncTimer = null;
			wkRemoteSyncInFlight = true;
			this.syncNow()
				.catch(err => reportSupabaseSyncError('Erro ao sincronizar com Supabase', err))
				.finally(() => {
					wkRemoteSyncPending = false;
					wkRemoteSyncInFlight = false;
					if (wkRemoteReloadPending) {
						wkRemoteReloadPending = false;
						this.queueReload();
					}
				});
		}, 450);
	}

	queueReload() {
		if (!this.isReady() || wkRemoteHydrating) return;
		if (wkRemoteSyncPending || wkRemoteSyncInFlight) {
			wkRemoteReloadPending = true;
			return;
		}
		if (wkRemoteReloadTimer) clearTimeout(wkRemoteReloadTimer);
		wkRemoteReloadTimer = setTimeout(() => {
			wkRemoteReloadTimer = null;
			this.loadRemoteState().catch(err => reportSupabaseSyncError('Erro ao recarregar do Supabase', err));
		}, 300);
	}

	async loadUnits() {
		if (!this.client || !currentSupabaseUser) return [];
		const { data, error } = await this.client.from('unidades').select('id, nome_padrao, cnpj, aliases, ativo').eq('ativo', true).order('nome_padrao', { ascending: true });
		if (error) throw error;
		buildUnitLookup(data || []);
		return data || [];
	}

	async loadRemoteState() {
		if (!this.client || !currentSupabaseUser) return;
		wkRemoteHydrating = true;
		try {
			await this.loadUnits();
			const [entriesResult, boletosResult, creditosResult, resumoImportResult] = await Promise.all([
				this.client.from('cargas_principais').select('*').order('created_at', { ascending: true }),
				this.client.from('cargas_boleto').select('*').order('created_at', { ascending: true }),
				this.client.from('creditos_fornecedor').select('*').order('created_at', { ascending: true }),
				this.client.from('resumo_volume_imports').select('*').order('imported_at', { ascending: false }).limit(1)
			]);

			if (entriesResult.error) throw entriesResult.error;
			if (boletosResult.error) throw boletosResult.error;
			if (creditosResult.error) throw creditosResult.error;
			if (resumoImportResult.error) throw resumoImportResult.error;

			const remoteEntries = (entriesResult.data || []).map(mapEntryRowToLocal);
			const remoteBoletos = (boletosResult.data || []).map(mapBoletoRowToLocal);
			const remoteCreditos = (creditosResult.data || []).map(mapCreditoRowToLocal);
			const frotaResult = await this.client
				.from('frota')
				.select('*')
				.eq('ativo', true)
				.order('categoria', { ascending: true })
				.order('veiculo', { ascending: true });
			if (!frotaResult.error) {
				frota = (frotaResult.data || []).map(mapFrotaRowToLocal);
			} else {
				frota = [];
				console.warn('Tabela de frota ainda não foi criada no Supabase.');
			}
			let remoteResumoRows = [];
			const latestImport = Array.isArray(resumoImportResult.data) ? resumoImportResult.data[0] : null;
			if (latestImport) {
				const { data: resumoItems, error: resumoItemsError } = await this.client
					.from('resumo_volume_itens')
					.select('*')
					.eq('import_id', latestImport.id)
					.order('created_at', { ascending: true });
				if (resumoItemsError) throw resumoItemsError;
				remoteResumoRows = (resumoItems || []).map(row => ({
					id: String(row.legacy_local_id || row.id),
					dbId: row.id || null,
					unidade: String(row.unidade_nome_snapshot || ''),
					produto: String(row.produto || ''),
					total: _normalizeDecimalString(String(row.total ?? '0'))
				}));
			}

			const localRaw = localStorage.getItem('wkComprasState');
			let localState = null;
			try {
				localState = localRaw ? JSON.parse(localRaw) : null;
			} catch (error) {
				localState = null;
			}
			const remoteEntryIds = new Set(remoteEntries.map(entry => String(entry.id)));
		const pendingLocalEntries = Array.isArray(localState?.entries)
				? localState.entries.filter(entry => !entry.removed && !remoteEntryIds.has(String(entry.id)))
				: [];
			if (pendingLocalEntries.length) {
				remoteEntries.push(...pendingLocalEntries);
				entries = remoteEntries;
				await this.syncNow();
			}

			entries = remoteEntries;
			boletos = remoteBoletos;
			creditos = remoteCreditos;
			if (latestImport !== null) resumoVolumeRows = remoteResumoRows;

			renderTable();
			renderTabelaBoleto();
			renderTabelaCredito();
			renderTabelaSaldoCredito();
			renderResumoVolumeTable();
			wkComprasLayoutController.renderDistribuidorChart();
			renderReferenciasCompras();

			const hasRemoteData = remoteEntries.length > 0 || remoteBoletos.length > 0 || remoteCreditos.length > 0 || remoteResumoRows.length > 0;
			if (!hasRemoteData && localRaw) {
				await this.migrateLocalStorageToSupabase(localRaw);
				await this.loadRemoteState();
			}
		} finally {
			wkRemoteHydrating = false;
		}
	}

	async clearAllMainCargas() {
		if (!this.isReady()) return;
		const timestamp = new Date().toISOString();
		let query = this.client
			.from('cargas_principais')
			.update({
				removed: true,
				removed_at: timestamp,
				removed_by: currentSupabaseUser ? currentSupabaseUser.id : null,
				updated_at: timestamp
			})
			.neq('removed', true);

		// Usuários comuns só podem alterar as próprias cargas; ADMIN pode limpar a tabela principal inteira.
		if (currentSupabaseProfile?.role !== 'ADMIN') {
			query = query.eq('created_by', currentSupabaseUser.id);
		}

		const { error } = await query;
		if (error) throw error;
	}

	async syncNow() {
		if (!this.isReady()) return;
		const timestamp = new Date().toISOString();
		const entryRows = entries.map(entry => ({
			...mapEntryToRemoteRow(entry),
			updated_at: timestamp
		}));
		const boletoRows = boletos.map(boleto => ({
			...mapBoletoToRemoteRow(boleto),
			updated_at: timestamp
		}));
		const creditoRows = creditos.map(item => ({
			...mapCreditoToRemoteRow(item),
			updated_at: timestamp
		}));

		const [entryUpsert, boletoUpsert, creditoUpsert] = await Promise.all([
			entryRows.length ? this.client.from('cargas_principais').upsert(entryRows, { onConflict: 'legacy_local_id' }).select('id, legacy_local_id') : Promise.resolve({ data: [], error: null }),
			boletoRows.length ? this.client.from('cargas_boleto').upsert(boletoRows, { onConflict: 'legacy_local_id' }).select('id, legacy_local_id') : Promise.resolve({ data: [], error: null }),
			creditoRows.length ? this.client.from('creditos_fornecedor').upsert(creditoRows, { onConflict: 'legacy_local_id' }).select('id, legacy_local_id') : Promise.resolve({ data: [], error: null })
		]);

		if (entryUpsert.error) throw entryUpsert.error;
		if (boletoUpsert.error) throw boletoUpsert.error;
		if (creditoUpsert.error) throw creditoUpsert.error;

		const applyDbIds = (rows, collection) => {
			(rows || []).forEach(row => {
				const localItem = collection.find(item => String(item.id) === String(row.legacy_local_id));
				if (localItem) localItem.dbId = row.id;
			});
		};
		applyDbIds(entryUpsert.data, entries);
		applyDbIds(boletoUpsert.data, boletos);
		applyDbIds(creditoUpsert.data, creditos);
	}

	async saveFechamentoCompra(dataReferencia, descricao) {
		if (!this.isReady()) throw new Error('É necessário estar autenticado para salvar uma referência.');
		if (currentSupabaseProfile?.role !== 'ADMIN') throw new Error('Somente administradores podem alterar referências de compras.');
		const { data, error } = await this.client
			.from('fechamentos_compras')
			.insert({
				data_referencia: dataReferencia,
				descricao: String(descricao || '').trim(),
				created_by: currentSupabaseUser.id,
				updated_by: currentSupabaseUser.id
			})
			.select('*')
			.single();
		if (error) throw error;
		return mapFechamentoCompraRowToLocal(data);
	}

	async saveReferenciaCompra(item) {
		if (!this.isReady()) throw new Error('É necessário estar autenticado para salvar uma referência.');
		if (currentSupabaseProfile?.role !== 'ADMIN') throw new Error('Somente administradores podem alterar referências de compras.');
		if (!item.fechamentoId) throw new Error('Selecione ou crie um fechamento diário antes de salvar.');
		const [unidadeId, produtoId, distribuidorId, baseId] = await Promise.all([
			this.ensureReferenciaCatalogId('referencias_unidades', item.unidade),
			this.ensureReferenciaCatalogId('referencias_produtos', item.produto),
			this.ensureReferenciaCatalogId('referencias_distribuidores', item.distribuidor),
			this.ensureReferenciaCatalogId('referencias_bases', item.base)
		]);
		const row = {
			id: item.dbId || undefined,
			fechamento_id: item.fechamentoId,
			unidade_id: unidadeId,
			produto_id: produtoId,
			distribuidor_id: distribuidorId,
			base_id: baseId,
			unidade: String(item.unidade || '').trim(),
			produto: String(item.produto || '').trim(),
			valor_unitario: Number.parseFloat(_normalizeDecimalString(String(item.valorUnitario || '0'))) || 0,
			distribuidor: String(item.distribuidor || '').trim(),
			base: String(item.base || '').trim(),
			created_by: item.created_by || currentSupabaseUser.id,
			updated_by: currentSupabaseUser.id
		};
		const { data, error } = await this.client
			.from('referencias_compras_itens')
			.upsert(row, { onConflict: 'id' })
			.select('*')
			.single();
		if (error) throw error;
		return mapReferenciaCompraItemRowToLocal(data);
	}

	async ensureReferenciaCatalogId(table, value) {
		const name = String(value || '').trim();
		if (!name) return null;
		const { data, error } = await this.client.from(table).select('id, nome');
		if (error) throw error;
		const normalized = normalizeReferenciaKey(name);
		const existing = (data || []).find(item => normalizeReferenciaKey(item.nome) === normalized);
		if (existing) return existing.id;
		const { data: inserted, error: insertError } = await this.client
			.from(table)
			.insert({ nome: name, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
			.select('id')
			.single();
		if (insertError) throw insertError;
		return inserted.id;
	}

	async deleteReferenciaCompra(id) {
		if (!this.isReady()) throw new Error('É necessário estar autenticado para excluir uma referência.');
		if (currentSupabaseProfile?.role !== 'ADMIN') throw new Error('Somente administradores podem excluir referências de compras.');
		const { error } = await this.client.from('referencias_compras_itens').delete().eq('id', id);
		if (error) throw error;
	}

	async deleteFechamentoCompra(id) {
		if (!this.isReady()) throw new Error('É necessário estar autenticado para excluir um fechamento.');
		if (currentSupabaseProfile?.role !== 'ADMIN') throw new Error('Somente administradores podem excluir fechamentos.');
		const { error } = await this.client.from('fechamentos_compras').delete().eq('id', id);
		if (error) throw error;
	}

	async migrateLocalStorageToSupabase(localRaw) {
		if (!this.isReady() || !localRaw) return;
		let state;
		try {
			state = JSON.parse(localRaw);
		} catch (error) {
			return;
		}

		const migrateEntries = Array.isArray(state.entries) ? state.entries.map(entry => ({
			...mapEntryToRemoteRow({ ...entry, id: String(entry.id || generateLocalRecordId()) }),
			updated_at: new Date().toISOString()
		})) : [];
		const migrateBoletos = Array.isArray(state.boletos) ? state.boletos.map(boleto => ({
			...mapBoletoToRemoteRow({ ...boleto, id: String(boleto.id || generateLocalRecordId()) }),
			updated_at: new Date().toISOString()
		})) : [];
		const migrateCreditos = Array.isArray(state.creditos) ? state.creditos.map(item => ({
			...mapCreditoToRemoteRow({ ...item, id: String(item.id || generateLocalRecordId()) }),
			updated_at: new Date().toISOString()
		})) : [];

		if (migrateEntries.length) {
			const { error } = await this.client.from('cargas_principais').upsert(migrateEntries, { onConflict: 'legacy_local_id' });
			if (error) throw error;
		}
		if (migrateBoletos.length) {
			const { error } = await this.client.from('cargas_boleto').upsert(migrateBoletos, { onConflict: 'legacy_local_id' });
			if (error) throw error;
		}
		if (migrateCreditos.length) {
			const { error } = await this.client.from('creditos_fornecedor').upsert(migrateCreditos, { onConflict: 'legacy_local_id' });
			if (error) throw error;
		}

		if (Array.isArray(state.resumoVolumeRows) && state.resumoVolumeRows.length) {
			const timestamp = new Date().toISOString();
			const { data: importRow, error: importError } = await this.client
				.from('resumo_volume_imports')
				.insert({
					source_hash: `wk-resumo-migracao-${Date.now()}`,
					file_name: 'wk_compras_resumo_volume_migrado',
					imported_by: currentSupabaseUser ? currentSupabaseUser.id : null,
					created_by: currentSupabaseUser ? currentSupabaseUser.id : null,
					updated_by: currentSupabaseUser ? currentSupabaseUser.id : null,
					created_at: timestamp,
					updated_at: timestamp,
					imported_at: timestamp
				})
				.select('id')
				.single();
			if (importError) throw importError;

			const resumoRows = state.resumoVolumeRows.map(item => {
				const unit = findUnitByName(item.unidade);
				return {
					legacy_local_id: String(item.id || generateLocalRecordId()),
					import_id: importRow.id,
					unidade_id: unit ? unit.id : null,
					unidade_nome_snapshot: String(item.unidade || ''),
					cnpj_snapshot: getCnpjForUnidade(item.unidade),
					produto: String(item.produto || ''),
					total: Number.parseFloat(_normalizeDecimalString(String(item.total || '0'))) || 0,
					created_by: currentSupabaseUser ? currentSupabaseUser.id : null,
					updated_by: currentSupabaseUser ? currentSupabaseUser.id : null,
					created_at: timestamp,
					updated_at: timestamp
				};
			});
			if (resumoRows.length) {
				const { error } = await this.client.from('resumo_volume_itens').upsert(resumoRows, { onConflict: 'legacy_local_id' });
				if (error) throw error;
			}
		}
	}

	async loadCurrentUserProfile(session) {
		if (!this.client || !session?.user) return null;
		const { data, error } = await this.client.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
		if (error) throw error;
		return data || null;
	}

	startRealtime() {
		if (!this.client || !currentSupabaseUser) return;
		this.stopRealtime();
		wkSupabaseRealtimeChannel = this.client
			.channel('wk-compras-realtime')
			.on('postgres_changes', { event: '*', schema: 'public', table: 'cargas_principais' }, () => this.queueReload())
			.on('postgres_changes', { event: '*', schema: 'public', table: 'cargas_boleto' }, () => this.queueReload())
			.on('postgres_changes', { event: '*', schema: 'public', table: 'creditos_fornecedor' }, () => this.queueReload())
			.on('postgres_changes', { event: '*', schema: 'public', table: 'resumo_volume_imports' }, () => this.queueReload())
			.on('postgres_changes', { event: '*', schema: 'public', table: 'resumo_volume_itens' }, () => this.queueReload())
			.subscribe();
	}

	stopRealtime() {
		if (wkSupabaseRealtimeChannel && this.client) {
			this.client.removeChannel(wkSupabaseRealtimeChannel);
		}
		wkSupabaseRealtimeChannel = null;
	}

	async syncResumoVolumeImport() {
		if (!this.isReady()) return;
		const hash = `wk-resumo-${Date.now()}-${resumoVolumeRows.length}`;
		const timestamp = new Date().toISOString();
		const { data: importRow, error: importError } = await this.client
			.from('resumo_volume_imports')
			.insert({
				source_hash: hash,
				file_name: 'wk_compras_resumo_volume',
				imported_by: currentSupabaseUser ? currentSupabaseUser.id : null,
				created_by: currentSupabaseUser ? currentSupabaseUser.id : null,
				updated_by: currentSupabaseUser ? currentSupabaseUser.id : null,
				created_at: timestamp,
				updated_at: timestamp,
				imported_at: timestamp
			})
			.select('id')
			.single();
		if (importError) throw importError;

		const rows = resumoVolumeRows.map(item => {
			const unit = findUnitByName(item.unidade);
			return {
				legacy_local_id: String(item.id || generateLocalRecordId()),
				import_id: importRow.id,
				unidade_id: unit ? unit.id : null,
				unidade_nome_snapshot: String(item.unidade || ''),
				cnpj_snapshot: getCnpjForUnidade(item.unidade),
				produto: String(item.produto || ''),
				total: Number.parseFloat(_normalizeDecimalString(String(item.total || '0'))) || 0,
				created_by: currentSupabaseUser ? currentSupabaseUser.id : null,
				updated_by: currentSupabaseUser ? currentSupabaseUser.id : null,
				created_at: timestamp,
				updated_at: timestamp
			};
		});
		if (rows.length) {
			const { error } = await this.client.from('resumo_volume_itens').upsert(rows, { onConflict: 'legacy_local_id' });
			if (error) throw error;
		}
	}
}

const wkComprasLayoutController = new WKComprasLayoutController();
const wkComprasPersistenceController = new WKComprasPersistenceController();
wkSupabaseSyncController = new WKComprasSupabaseSyncController(wkSupabaseClient);

// ===== FUNÇÕES DE NAVEGAÇÃO POR ABAS =====
function switchTab(tabId, eventArg) {
	return wkComprasLayoutController.switchTab(tabId, eventArg);
}

// ===== FUNÇÕES DE CONTROLE DO MENU LATERAL =====
function toggleSidebar() {
	return wkComprasLayoutController.toggleSidebar();
}

// Restaurar estado do sidebar ao carregar a página
window.addEventListener('DOMContentLoaded', function() {
	wkComprasLayoutController.restoreSidebarState();
	initializeTheme();
});

function openDistribuidorPanel() {
	return wkComprasLayoutController.openDistribuidorPanel();
}

function closeDistribuidorPanel() {
	return wkComprasLayoutController.closeDistribuidorPanel();
}

function renderDistribuidorChart() {
	return wkComprasLayoutController.renderDistribuidorChart();
}

function saveState() {
	const result = wkComprasPersistenceController.saveState();
	if (wkSupabaseSyncController) wkSupabaseSyncController.queueSync();
	return result;
}

function saveLocalStateOnly() {
	return wkComprasPersistenceController.saveState();
}

function loadState() {
	return wkComprasPersistenceController.loadState();
}

function reportSupabaseSyncError(context, error) {
	const message = error && error.message ? error.message : String(error || 'Erro desconhecido');
	console.error(`${context}:`, error);
	if (typeof setAuthMessage === 'function') {
		setAuthMessage(`${context}: ${message}`);
	}
	return message;
}

function normalizeReferenciaKey(value) {
		return normalizeLookupText(value);
	}

	function normalizeReferenciaUnitKey(value) {
		return normalizeReferenciaKey(value).replace(/mt$/, '');
	}

	function findReferenciaCompra(unidade, produto, cnpj) {
		const unidadeKey = normalizeReferenciaKey(unidade);
		const unidadeCanonicalKey = normalizeReferenciaUnitKey(unidade);
		const produtoKey = normalizeReferenciaKey(produto);
		if (!unidadeKey || !produtoKey) return null;
		const candidates = referenciasCompras.filter(item =>
			item.ativo !== false
			&& normalizeReferenciaKey(item.produto) === produtoKey
		);
		const exact = candidates.filter(item => normalizeReferenciaKey(item.unidade) === unidadeKey);
		if (exact.length === 1) return exact[0];
		if (exact.length > 1) return null;

		const unitMatches = candidates.filter(item => normalizeReferenciaUnitKey(item.unidade) === unidadeCanonicalKey);
		if (unitMatches.length !== 1) return null;

		const sourceCnpj = String(cnpj || '').replace(/\D/g, '');
		const referenceCnpj = getKnownUnitCnpj(unitMatches[0].unidade).replace(/\D/g, '');
		if (sourceCnpj && referenceCnpj && sourceCnpj !== referenceCnpj) return null;
		return unitMatches[0];
	}

	function selecionarFechamentoCompra(id) {
			return id;
	}

	async function criarFechamentoCompra() {
		return null;
	}

	function formatReferenceValue(value) {
		const normalized = _normalizeDecimalString(String(value || '0'));
		return normalized === '0' ? '' : normalized.replace('.', ',');
	}

	function renderReferenciasCompras() {
		const table = document.getElementById('tabelaReferenciasCompras');
		if (!table) return;
		const tbody = table.querySelector('tbody');
		tbody.innerHTML = '';
		const selectedItems = referenciasCompras.filter(item => item.ativo !== false);
		selectedItems.forEach(item => {
			const row = tbody.insertRow();
			row.innerHTML = `
				<td>${escapeHtml(item.unidade)}</td>
				<td>${escapeHtml(item.produto)}</td>
				<td>${escapeHtml(formatReferenceValue(item.valorUnitario))}</td>
				<td>${escapeHtml(item.distribuidor)}</td>
				<td>${escapeHtml(item.base)}</td>
				<td><button type="button" onclick="editarReferenciaCompra('${item.id}')">Editar</button><button type="button" class="danger-button" onclick="excluirReferenciaCompra('${item.id}')">Excluir</button></td>
			`;
		});
		const empty = document.getElementById('referenciasComprasVazio');
		if (empty) empty.style.display = selectedItems.length ? 'none' : 'block';
		const unidadeSelect = document.getElementById('referenciaUnidade');
		if (unidadeSelect) {
			const currentValue = unidadeSelect.value;
			unidadeSelect.innerHTML = buildReferenceOptions(UNIDADE_CNPJ_MAP.flatMap(item => item.aliases).filter((value, index, values) => values.indexOf(value) === index), currentValue);
			unidadeSelect.value = currentValue;
		}
		const produtoSelect = document.getElementById('referenciaProduto');
		if (produtoSelect) {
			const currentValue = produtoSelect.value;
			produtoSelect.innerHTML = buildReferenceOptions(['GASOLINA COMUM', 'GASOLINA ADITIVADA', 'DIESEL S10', 'DIESEL S500', 'S-10', 'S-500', 'ETANOL'], currentValue);
			produtoSelect.value = currentValue;
		}
		const form = document.getElementById('formReferenciaCompra');
		if (form) form.style.display = '';
		const note = document.getElementById('referenciasComprasPermissao');
		if (note) note.textContent = '';
	}

	function buildReferenceOptions(values, currentValue) {
		const options = ['<option value="">Selecione</option>'];
		values.forEach(value => {
			options.push(`<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`);
		});
		if (currentValue && !values.includes(currentValue)) options.push(`<option value="${escapeHtml(currentValue)}">${escapeHtml(currentValue)}</option>`);
		return options.join('');
	}

	function escapeHtml(value) {
		return String(value || '').replace(/[&<>"']/g, character => ({
			'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
		}[character]));
	}

	function limparFormularioReferenciaCompra() {
		const form = document.getElementById('formReferenciaCompra');
		if (form) form.reset();
		const id = document.getElementById('referenciaCompraId');
		if (id) id.value = '';
		const cancel = document.getElementById('cancelarEdicaoReferencia');
		if (cancel) cancel.style.display = 'none';
	}

	function editarReferenciaCompra(id) {
		const item = referenciasCompras.find(reference => reference.id === String(id));
		if (!item) return;
		document.getElementById('referenciaCompraId').value = item.id;
		document.getElementById('referenciaUnidade').value = item.unidade;
		document.getElementById('referenciaProduto').value = item.produto;
		document.getElementById('referenciaValorUnitario').value = formatReferenceValue(item.valorUnitario);
		document.getElementById('referenciaDistribuidor').value = item.distribuidor;
		document.getElementById('referenciaBase').value = item.base;
		document.getElementById('cancelarEdicaoReferencia').style.display = '';
	}

	async function salvarReferenciaCompra(event) {
		event.preventDefault();
		const unidade = document.getElementById('referenciaUnidade').value.trim();
		const produto = document.getElementById('referenciaProduto').value.trim();
		if (!unidade || !produto) {
			alert('Informe a Unidade e o Produto.');
			return;
		}
		const id = document.getElementById('referenciaCompraId').value;
		const duplicate = referenciasCompras.find(item =>
			item.id !== id
			&& normalizeReferenciaKey(item.unidade) === normalizeReferenciaKey(unidade)
			&& normalizeReferenciaKey(item.produto) === normalizeReferenciaKey(produto)
		);
		if (duplicate) {
			alert('Já existe uma referência cadastrada para essa Unidade + Produto.');
			return;
		}
		const item = {
			id: id || generateLocalRecordId(),
			unidade,
			produto,
			valorUnitario: _normalizeDecimalString(document.getElementById('referenciaValorUnitario').value),
			distribuidor: document.getElementById('referenciaDistribuidor').value.trim(),
			base: document.getElementById('referenciaBase').value.trim()
		};
		const index = referenciasCompras.findIndex(reference => reference.id === item.id);
		if (index >= 0) referenciasCompras[index] = item;
		else referenciasCompras.push(item);
		referenciasCompras.sort((left, right) => `${left.unidade} ${left.produto}`.localeCompare(`${right.unidade} ${right.produto}`));
		limparFormularioReferenciaCompra();
		saveLocalStateOnly();
		renderReferenciasCompras();
	}

	async function salvarReferenciasEmLote() {
		const textarea = document.getElementById('referenciasLote');
		const linhas = String(textarea?.value || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
		if (!linhas.length) {
			alert('Informe ao menos uma linha no formato UNIDADE;PRODUTO;VALOR;DISTRIBUIDOR;BASE.');
			return;
		}
		try {
			for (const linha of linhas) {
				const [unidade, produto, valorUnitario, distribuidor, base] = linha.split(/[;\t]/).map(value => String(value || '').trim());
				if (!unidade || !produto) throw new Error(`Linha inválida: ${linha}`);
				const existente = referenciasCompras.find(item =>
					normalizeReferenciaKey(item.unidade) === normalizeReferenciaKey(unidade)
					&& normalizeReferenciaKey(item.produto) === normalizeReferenciaKey(produto)
				);
				const saved = {
					id: existente?.id || generateLocalRecordId(),
					unidade,
					produto,
					valorUnitario: _normalizeDecimalString(valorUnitario),
					distribuidor,
					base
				};
				const index = referenciasCompras.findIndex(item => item.id === saved.id);
				if (index >= 0) referenciasCompras[index] = saved;
				else referenciasCompras.push(saved);
			}
			if (textarea) textarea.value = '';
			saveLocalStateOnly();
			renderReferenciasCompras();
			alert(`${linhas.length} item(ns) salvo(s).`);
		} catch (error) {
			alert(`Não foi possível salvar o lote: ${error.message || error}`);
		}
	}

	async function excluirReferenciaCompra(id) {
		if (!confirm('Excluir esta referência de compras?')) return;
		referenciasCompras = referenciasCompras.filter(item => item.id !== String(id));
		saveLocalStateOnly();
		renderReferenciasCompras();
}

function updateAuthUi(connected) {
	const body = document.body;
	const authGate = document.getElementById('authGate');
	const sessionBar = document.getElementById('sessionBar');
	const sessionUserName = document.getElementById('sessionUserName');
	const sessionUserRole = document.getElementById('sessionUserRole');

	if (body) {
		body.classList.toggle('authenticated', Boolean(connected));
	}
	if (authGate) authGate.style.display = connected ? 'none' : 'flex';
	if (!connected && sessionBar) {
		sessionBar.style.display = 'none';
		const userMenuButton = document.querySelector('.user-menu-button');
		if (userMenuButton) userMenuButton.setAttribute('aria-expanded', 'false');
	}
	if (sessionUserName) sessionUserName.innerText = currentSupabaseProfile?.full_name || currentSupabaseUser?.email || 'Usuário';
	if (sessionUserRole) sessionUserRole.innerText = currentSupabaseProfile?.role || 'USUARIO';
}

function toggleUserMenu() {
	const panel = document.getElementById('sessionBar');
	const button = document.querySelector('.user-menu-button');
	if (button) button.setAttribute('aria-expanded', 'true');
	switchTab('tab-usuario');
	const emailInput = document.getElementById('userLoginEmail');
	if (emailInput && currentSupabaseUser?.email && !emailInput.value) {
		emailInput.value = currentSupabaseUser.email;
	}
	if (panel) panel.style.display = 'none';
}

function openSystemInfo() {
	const panel = document.getElementById('systemInfoPanel');
	if (!panel) return;
	panel.style.display = 'flex';
}

function closeSystemInfo(event) {
	if (event && event.target !== event.currentTarget) return;
	const panel = document.getElementById('systemInfoPanel');
	if (panel) panel.style.display = 'none';
}

function applyDarkMode(enabled) {
	document.body.classList.toggle('dark-mode', enabled);
	document.querySelectorAll('.theme-toggle-button, .theme-toggle-card').forEach(button => {
		button.setAttribute('aria-pressed', String(enabled));
		button.setAttribute('title', enabled ? 'Desativar modo escuro' : 'Ativar modo escuro');
	});
	document.querySelectorAll('.theme-toggle-icon').forEach(icon => {
		icon.textContent = enabled ? '☀' : '☾';
	});
	document.querySelectorAll('.theme-toggle-label').forEach(label => {
		label.textContent = enabled ? 'Modo claro' : 'Modo escuro';
	});
}

function toggleDarkMode() {
	const enabled = !document.body.classList.contains('dark-mode');
	localStorage.setItem('wkComprasDarkMode', String(enabled));
	applyDarkMode(enabled);
}

function initializeTheme() {
	const savedTheme = localStorage.getItem('wkComprasDarkMode');
	const enabled = savedTheme === null
		? window.matchMedia('(prefers-color-scheme: dark)').matches
		: savedTheme === 'true';
	applyDarkMode(enabled);
}

function setAuthMessage(message, isError = true) {
	const authMessage = document.getElementById('authMessage');
	if (!authMessage) return;
	authMessage.innerText = message || '';
	authMessage.style.color = isError ? 'var(--brand-red)' : 'var(--brand-blue-800)';
}

async function handleLoginSubmit(event, formType = 'gate') {
	if (event) event.preventDefault();
	const messageId = formType === 'user' ? 'userAuthMessage' : 'authMessage';
	if (!wkSupabaseClient) {
		setAuthMessageFor(messageId, 'Supabase não está configurado neste ambiente.');
		return;
	}
	const prefix = formType === 'user' ? 'userLogin' : 'login';
	const emailInput = document.getElementById(`${prefix}Email`);
	const passwordInput = document.getElementById(`${prefix}Password`);
	const button = document.getElementById(`${prefix}Button`);
	const email = emailInput ? String(emailInput.value || '').trim() : '';
	const password = passwordInput ? String(passwordInput.value || '') : '';
	if (!email || !password) {
		setAuthMessageFor(messageId, 'Informe e-mail e senha.');
		return;
	}
	if (button) button.disabled = true;
	setAuthMessageFor(messageId, 'Entrando...', false);
	const { data, error } = await wkSupabaseClient.auth.signInWithPassword({ email, password });
	if (button) button.disabled = false;
	if (error) {
		setAuthMessageFor(messageId, error.message || 'Falha no login.');
		return;
	}
	currentSupabaseSession = data.session || null;
	setAuthMessageFor(messageId, 'Login realizado.', false);
}

function setAuthMessageFor(elementId, message, isError = true) {
	const authMessage = document.getElementById(elementId);
	if (!authMessage) return;
	authMessage.innerText = message || '';
	authMessage.style.color = isError ? 'var(--brand-red)' : 'var(--brand-blue-800)';
}

function getSupabaseRecoveryRedirectUrl() {
	return `${window.location.origin}${window.location.pathname}`;
}

async function sendPasswordRecovery(formType = 'gate') {
	if (!wkSupabaseClient) {
		setAuthMessage('Supabase não está configurado neste ambiente.');
		return;
	}
	const emailInput = document.getElementById(formType === 'user' ? 'userLoginEmail' : 'loginEmail');
	const email = emailInput ? String(emailInput.value || '').trim() : '';
	if (!email) {
		setAuthMessageFor(formType === 'user' ? 'userAuthMessage' : 'authMessage', 'Digite seu e-mail para receber o link de recuperação.');
		if (emailInput) emailInput.focus();
		return;
	}
	const messageId = formType === 'user' ? 'userAuthMessage' : 'authMessage';
	setAuthMessageFor(messageId, 'Enviando link de recuperação...', false);
	const { error } = await wkSupabaseClient.auth.resetPasswordForEmail(email, {
		redirectTo: getSupabaseRecoveryRedirectUrl()
	});
	if (error) {
		setAuthMessageFor(messageId, error.message || 'Não foi possível enviar o link de recuperação.');
		return;
	}
	setAuthMessageFor(messageId, 'Link de recuperação enviado para seu e-mail. Verifique também o Spam.', false);
}

async function handlePasswordRecovery() {
	if (!wkSupabaseClient) return;
	setAuthMessage('Link de recuperação recebido. Defina sua nova senha.', false);
	const password = window.prompt('Digite sua NOVA senha (mínimo de 6 caracteres):');
	if (password === null) return;
	if (password.length < 6) {
		setAuthMessage('A nova senha precisa ter pelo menos 6 caracteres.');
		return;
	}
	const confirmation = window.prompt('Digite a nova senha novamente para confirmar:');
	if (confirmation === null) return;
	if (password !== confirmation) {
		setAuthMessage('As senhas não conferem. Tente novamente.');
		return;
	}
	const { error } = await wkSupabaseClient.auth.updateUser({ password });
	if (error) {
		setAuthMessage(error.message || 'Não foi possível atualizar a senha.');
		return;
	}
	await wkSupabaseClient.auth.signOut();
	currentSupabaseSession = null;
	currentSupabaseProfile = null;
	currentSupabaseUser = null;
	if (wkSupabaseSyncController) wkSupabaseSyncController.stopRealtime();
	updateAuthUi(false);
	setAuthMessage('Senha alterada com sucesso! Agora entre com sua nova senha.', false);
}

function setupPasswordRecoveryUi() {
	const passwordInput = document.getElementById('loginPassword');
	if (!passwordInput || document.getElementById('forgotPasswordButton')) return;
	const button = document.createElement('button');
	button.type = 'button';
	button.id = 'forgotPasswordButton';
	button.textContent = 'Esqueci minha senha';
	button.style.cssText = 'display:block;margin:10px auto 0;background:none;border:0;padding:4px;color:var(--brand-blue-800);cursor:pointer;text-decoration:underline;font:inherit;';
	button.addEventListener('click', sendPasswordRecovery);
	passwordInput.insertAdjacentElement('afterend', button);
}

async function logout() {
	saveLocalStateOnly();
	if (wkSupabaseClient) {
		await wkSupabaseClient.auth.signOut();
	}
	currentSupabaseSession = null;
	currentSupabaseProfile = null;
	currentSupabaseUser = null;
	if (wkSupabaseSyncController) wkSupabaseSyncController.stopRealtime();
	updateAuthUi(false);
	setAuthMessage('');
}

async function initializeSupabaseApp() {
	if (!wkSupabaseClient) {
		setAuthMessage('Supabase não carregou corretamente.');
		updateAuthUi(false);
		return;
	}

	const { data } = await wkSupabaseClient.auth.getSession();
	currentSupabaseSession = data?.session || null;
	currentSupabaseUser = currentSupabaseSession?.user || null;

	if (currentSupabaseSession && wkSupabaseSyncController) {
		try {
			currentSupabaseProfile = await wkSupabaseSyncController.loadCurrentUserProfile(currentSupabaseSession);
			if (currentSupabaseProfile && currentSupabaseProfile.active === false) {
				await logout();
				setAuthMessage('Usuário inativo.');
				return;
			}
			updateAuthUi(true);
			await wkSupabaseSyncController.loadRemoteState();
			wkSupabaseSyncController.startRealtime();
		} catch (error) {
			console.error(error);
			setAuthMessage('Erro ao carregar dados do Supabase.');
			updateAuthUi(false);
		}
	} else {
		updateAuthUi(false);
	}

	if (!wkSupabaseAuthInitialized && wkSupabaseClient) {
		wkSupabaseAuthInitialized = true;
		wkSupabaseClient.auth.onAuthStateChange(async (_event, session) => {
			currentSupabaseSession = session || null;
			currentSupabaseUser = session?.user || null;
			if (_event === 'PASSWORD_RECOVERY') {
				updateAuthUi(false);
				setTimeout(() => { handlePasswordRecovery().catch(error => { console.error(error); setAuthMessage('Erro ao processar a recuperação de senha.'); }); }, 0);
				return;
			}
			if (!session) {
				currentSupabaseProfile = null;
				if (wkSupabaseSyncController) wkSupabaseSyncController.stopRealtime();
				updateAuthUi(false);
				return;
			}
			try {
				currentSupabaseProfile = await wkSupabaseSyncController.loadCurrentUserProfile(session);
				updateAuthUi(true);
				await wkSupabaseSyncController.loadRemoteState();
				wkSupabaseSyncController.startRealtime();
			} catch (error) {
				console.error(error);
				setAuthMessage('Erro ao carregar a sessão.');
			}
		});
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
	const fMotor = (activeFilters.motorista || '').toLowerCase().trim();
	entries.forEach(entry => {
		if (entry.removed) { entry.selected = false; return; }
		if (fUnidade && !String(entry.unidade || '').toLowerCase().includes(fUnidade)) return;
		if (fDistrib && !String(entry.distribuidora || '').toLowerCase().includes(fDistrib)) return;
		if (fMotor && !String(entry.motorista || '').toLowerCase().includes(fMotor)) return;
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
	return WKComprasUtils.produtoFiltra(entryProduto, filtroProduto);
}

function _normalizeDecimalString(s) {
	return WKComprasUtils.normalizeDecimalString(s);
}

function syncCreditoWithEntry(entry) {
	if (!entry) return;
	const item = creditos.find(i => String(i.id) === String(entry.id));
	if (!item) return;
	item.unidade = entry.unidade;
	item.distribuidora = entry.distribuidora;
	item.produto = entry.produto;
	item.volumeNorm = entry.volumeNorm;
	item.litrosStr = entry.litrosStr;
	item.valorNorm = entry.valorNorm;
	item.totalStr = entry.totalStr;
	item.novoValorNorm = _normalizeDecimalString(String(item.novoValorNorm || entry.valorNorm || '0'));
	item.novoTotalStr = multiplyDecimalStrings(item.litrosStr, item.novoValorNorm);
	if (!item.valorPago || _normalizeDecimalString(String(item.valorPago)) === '0') {
		item.valorPago = entry.totalStr;
	}
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
		syncCreditoWithEntry(entry);
		any = true;
	});
	if (!any) { alert('Nenhuma linha selecionada.'); return; }
	const chk = document.getElementById('selectAllCheckbox'); if (chk) chk.checked = false;
	saveState();
	renderTable();
	renderTabelaCredito();
}

function applyFilters() {
	activeFilters.unidade = document.getElementById('filterUnidade').value || '';
	activeFilters.distribuidora = document.getElementById('filterDistribuidora').value || '';
	activeFilters.produto = document.getElementById('filterProduto').value || '';
	activeFilters.motorista = document.getElementById('filterMotorista') ? document.getElementById('filterMotorista').value || '' : '';
	renderTable();
}

function clearFilters() {
	activeFilters = { unidade: '', distribuidora: '', produto: '', motorista: '' };
	const fu = document.getElementById('filterUnidade');
	const fd = document.getElementById('filterDistribuidora');
	const fm = document.getElementById('filterMotorista');
	const fp = document.getElementById('filterProduto');
	if (fu) fu.value = '';
	if (fd) fd.value = '';
	if (fm) fm.value = '';
	if (fp) {
		try { fp.selectedIndex = 0; } catch (e) { fp.value = ''; }
	}
	renderTable();
	saveState();
	console.log('clearFilters: filters cleared');
}

async function clearAllCargas() {
	if (!confirm('Confirma apagar todas as cargas da aba principal? Esta ação não afeta o Boleto nem o Resumo de Volume.')) return;

	const previousEntries = entries;
	entries = [];
	renderTable();
	saveLocalStateOnly();

	try {
		// IMPORTANTE: limpar só o array local não apaga o que já está no Supabase.
		// Marcamos as cargas remotas como removidas imediatamente para que o Realtime
		// não as carregue de volta alguns segundos/minutos depois.
		if (wkSupabaseSyncController) {
			await wkSupabaseSyncController.clearAllMainCargas();
		}

		// Persiste novamente o estado vazio depois da confirmação do servidor.
		saveLocalStateOnly();
		alert('Todas as cargas da aba principal foram removidas.');
		console.log('clearAllCargas: local e Supabase limpos');
	} catch (error) {
		// Se o Supabase recusar a alteração, não deixamos a tela localmente vazia.
		entries = previousEntries;
		renderTable();
		saveLocalStateOnly();
		reportSupabaseSyncError('Não foi possível limpar as cargas no Supabase', error);
		alert('As cargas foram restauradas porque não foi possível confirmar a exclusão no servidor.');
	}
}

// (restored backup functions are below)

function _splitIntScale(s) {
	return WKComprasUtils.splitIntScale(s);
}

function _padRight(str, n) { return WKComprasUtils.padRight(str, n); }

function multiplyDecimalStrings(a, b) {
	return WKComprasUtils.multiplyDecimalStrings(a, b);
}

function addDecimalStrings(a, b) {
	return WKComprasUtils.addDecimalStrings(a, b);
}

function subtractDecimalStrings(a, b) {
	return WKComprasUtils.subtractDecimalStrings(a, b);
}

function _formatDecimalLocale(s) {
	return WKComprasUtils.formatDecimalLocale(s);
}

function formatarMoedaFromDecimalString(s) {
	return WKComprasUtils.formatMoney(s);
}

function formatNumberFromDecimalString(s) {
	return WKComprasUtils.formatNumber(s);
}

function extractFirstTwoNames(value) {
	return WKComprasUtils.extractFirstTwoNames(value);
}

function adicionarCarga() {
	const unidade = document.getElementById('unidade').value.trim();
	const data = normalizeDateValue(document.getElementById('data').value.trim());
	const etiqueta = document.getElementById('etiqueta').value;
	const distribuidora = document.getElementById('distribuidora').value.trim();
	const motorista = document.getElementById('motorista').value.trim();
	const produto = document.getElementById('produto').value;
	const volumeStrRaw = document.getElementById('volume').value.trim();
	const valorStrRaw = document.getElementById('valor').value.trim();

	if (!unidade || !data || !distribuidora || !volumeStrRaw || !valorStrRaw) {
		alert('Preencha todos os campos!');
		return;
	}

	if (!isValidMonthDay(data)) {
		alert('Informe uma data válida.');
		return;
	}

	adicionarCargaComDados(unidade, data, etiqueta, distribuidora, motorista, produto, volumeStrRaw, valorStrRaw);

	document.getElementById('volume').value = '';
	document.getElementById('valor').value = '';
	document.getElementById('data').value = '';
	document.getElementById('etiqueta').value = '';
	document.getElementById('motorista').value = '';
}

function formatDateForDisplay(value) {
	const normalized = WKComprasUtils.normalizeDateValue(value);
	if (!normalized) return '';
	const [year, month, day] = normalized.split('-').map(Number);
	if (!year || !month || !day) return '';
	return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

function excelSerialToDate(serial) {
	return WKComprasUtils.excelSerialToDate(serial);
}

function normalizeDateValue(value) {
	return WKComprasUtils.normalizeDateValue(value);
}

function findDateValueInRow(row) {
	return WKComprasUtils.findDateValueInRow(row);
}

function isValidMonthDay(value) {
	return WKComprasUtils.isValidMonthDay(value);
}

function removerLinhaById(id) {
	const targetEntries = getEntryEditTargets(id);
	if (!targetEntries.length) return;
	targetEntries.forEach(entry => {
		entry.removed = true;
		entry.selected = false;
	});
	renderTable();
	// O código anterior só escondia a carga na tela. Sem saveState(),
	// ela não era sincronizada como removed=true no Supabase e podia voltar.
	saveState();
}

function removerSelecionadosPrincipal() {
	const selected = entries.find(entry => !entry.removed && entry.selected);
	if (!selected) {
		alert('Selecione ao menos uma carga na tabela principal.');
		return;
	}
	removerLinhaById(selected.id);
}

function renderTable() {
	const tbody = document.querySelector('#tabela tbody');
	tbody.innerHTML = '';
	let totalVisible = '0';
	const fUnidade = (activeFilters.unidade || '').toLowerCase().trim();
	const fDistrib = (activeFilters.distribuidora || '').toLowerCase().trim();
	const fProd = (activeFilters.produto || '').toLowerCase().trim();
	const fMotor = (activeFilters.motorista || '').toLowerCase().trim();

	entries.forEach(entry => {
		if (entry.removed) return;
		if (fUnidade && !String(entry.unidade || '').toLowerCase().includes(fUnidade)) return;
		if (fDistrib && !String(entry.distribuidora || '').toLowerCase().includes(fDistrib)) return;
		if (fMotor && !String(entry.motorista || '').toLowerCase().includes(fMotor)) return;
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
			<td><input type="date" value="${String(entry.data || '').slice(0, 10)}" onchange="updateEntryDateById('${entry.id}', this.value)" style="width:120px;" /></td>
			<td>${entry.distribuidora}</td>
			<td>${entry.motorista || ''}</td>
			<td>${entry.produto}</td>
			<td>${entry.volumeNorm}</td>
			<td>${formatNumberFromDecimalString(entry.litrosStr)}</td>
			<td class="money-unit"><input type="text" inputmode="decimal" value="${String(entry.valorNorm || '0').replace('.', ',')}" onchange="updateEntryValorById('${entry.id}', this.value)" style="width:90px;" /></td>
			<td class="money-total">${formatarMoedaFromDecimalString(entry.totalStr)}</td>
			<td style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;"><button class="delete-btn" style="background:#10b981;" onclick="moverParaBoleto('${entry.id}')">Boleto</button><button class="delete-btn" style="background:#8b5cf6;" onclick="moverParaCredito('${entry.id}')">Crédito</button><button class="delete-btn" style="background:#f59e0b;" onclick="editValorById('${entry.id}')">Editar</button><button class="delete-btn" onclick="removerLinhaById('${entry.id}')">Excluir</button></td>
		`;

		totalVisible = addDecimalStrings(totalVisible, entry.totalStr);
	});

	document.getElementById('totalGeral').innerText = formatarMoedaFromDecimalString(totalVisible);
	renderVolumeSummary();
	renderDistribuidorChart();
}

function setEntryLabel(id, label) {
	const targetEntries = getEntryEditTargets(id);
	if (!targetEntries.length) return;
	targetEntries.forEach(entry => {
		entry.etiqueta = String(label || '');
	});
	saveState();
	renderTable();
}

function getEntryEditTargets(id) {
	const selectedEntries = entries.filter(entry => !entry.removed && entry.selected);
	if (selectedEntries.length > 0) return selectedEntries;
	const entry = entries.find(item => String(item.id) === String(id) && !item.removed);
	return entry ? [entry] : [];
}

function editValorById(id) {
	const targetEntries = getEntryEditTargets(id);
	if (!targetEntries.length) return alert('Registro não encontrado');
	const current = targetEntries[0].valorNorm;
	const input = prompt('Informe o novo Valor por litro para os itens selecionados (use ponto para decimais):', current);
	if (input === null) return; // cancelou
	const novo = _normalizeDecimalString(String(input));
	if (novo === '0' && String(input).trim() !== '0') { alert('Valor inválido'); return; }

	targetEntries.forEach(entry => {
		entry.valorNorm = novo;
		entry.totalStr = multiplyDecimalStrings(entry.litrosStr, entry.valorNorm);
		syncCreditoWithEntry(entry);
	});
	saveState();
	renderTable();
	renderTabelaCredito();
}

function updateEntryValorById(id, valorRaw) {
	const targetEntries = getEntryEditTargets(id);
	if (!targetEntries.length) return;

	const novo = _normalizeDecimalString(String(valorRaw ?? ''));
	if (novo === '0' && String(valorRaw ?? '').trim() !== '0') {
		alert('Valor inválido');
		renderTable();
		return;
	}

	targetEntries.forEach(entry => {
		entry.valorNorm = novo;
		entry.totalStr = multiplyDecimalStrings(entry.litrosStr, entry.valorNorm);
		syncCreditoWithEntry(entry);
	});

	saveState();
	renderTable();
	renderTabelaCredito();
}

function updateEntryDateById(id, dateValue) {
	const targetEntries = getEntryEditTargets(id);
	if (!targetEntries.length) return;

	const normalized = normalizeDateValue(dateValue);
	if (!normalized || !isValidMonthDay(normalized)) {
		alert('Data inválida');
		renderTable();
		return;
	}

	targetEntries.forEach(entry => {
		entry.data = normalized;
	});

	saveState();
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

function adicionarCargaComDados(unidade, data, etiqueta, distribuidora, motorista, produto, volumeStrRaw, valorStrRaw, persist = true) {
	const volumeNorm = _normalizeDecimalString(String(volumeStrRaw));
	const valorNorm = _normalizeDecimalString(String(valorStrRaw));

	const litrosStr = multiplyDecimalStrings(volumeNorm, '1000');
	const totalStr = multiplyDecimalStrings(litrosStr, valorNorm);

	const entry = {
		id: generateLocalRecordId(),
		dbId: null,
		unidade: String(unidade),
		etiqueta: String(etiqueta || ''),
		data: String(data),
		distribuidora: String(distribuidora),
		motorista: String(motorista || ''),
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
	if (persist) saveState();
}

function adicionarCargaBoleto() {
	const unidade = document.getElementById('boletoUnidade').value.trim();
	const data = normalizeDateValue(document.getElementById('boletoData').value);
	const etiqueta = document.getElementById('boletoEtiqueta').value;
	const distribuidora = document.getElementById('boletoDistribuidora').value.trim();
	const motorista = document.getElementById('boletoMotorista').value.trim();
	const produto = document.getElementById('boletoProduto').value;
	const volumeStrRaw = document.getElementById('boletoVolume').value.trim();
	const valorStrRaw = document.getElementById('boletoValor').value.trim();

	if (!unidade || !distribuidora || !volumeStrRaw || !valorStrRaw) {
		alert('Preencha todos os campos do boleto.');
		return;
	}

	if (data && !isValidMonthDay(data)) {
		alert('Data inválida');
		return;
	}

	const volumeNorm = _normalizeDecimalString(String(volumeStrRaw));
	const valorNorm = _normalizeDecimalString(String(valorStrRaw));
	const litrosStr = multiplyDecimalStrings(volumeNorm, '1000');
	const totalStr = multiplyDecimalStrings(litrosStr, valorNorm);

	boletos.push({
		id: generateLocalRecordId(),
		dbId: null,
		source_carga_id: null,
		unidade: String(unidade),
		etiqueta: String(etiqueta || ''),
		data: String(data || ''),
		distribuidora: String(distribuidora),
		motorista: String(motorista || ''),
		produto: String(produto),
		selected: false,
		volumeNorm,
		litrosStr,
		valorNorm,
		totalStr
	});

	document.getElementById('boletoUnidade').value = '';
	document.getElementById('boletoData').value = '';
	document.getElementById('boletoEtiqueta').value = '';
	document.getElementById('boletoDistribuidora').value = '';
	document.getElementById('boletoMotorista').value = '';
	document.getElementById('boletoProduto').value = 'GC';
	document.getElementById('boletoVolume').value = '';
	document.getElementById('boletoValor').value = '';

	renderTabelaBoleto();
	saveState();
}

function importarPlanilha() {
	const input = document.getElementById('fileInput');
	if (!input || !input.files || input.files.length === 0) { alert('Escolha um arquivo primeiro.'); return; }
	const file = input.files[0];
	const reader = new FileReader();
	reader.onload = async function(e) {
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
				const dataImport = normalizeDateValue(findVal(['data','date','dt','dia','data carga','data da carga']) || findDateValueInRow(row)) || getTodayDateString();
				const motoristaRaw = findVal(['motorista','driver','nome motorista','motorista nome','motorista nome completo']) || (Object.values(row)[3] || '');
				const produto = findVal(['produto','product','produto/serviço','material']) || (Object.values(row)[4] || '');
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
					if (sample.length < 5) sample.push({ row: rowIndex+1, parsed: { unidade, distribuidora, motorista: extractFirstTwoNames(motoristaRaw), produto, volume, valor }, raw: row });
					return;
				}

				adicionarCargaComDados(String(unidade), dataImport, '', String(distribuidora), extractFirstTwoNames(motoristaRaw), String(produto), String(volume), String(valor), false);
				added++;
			});

			console.log('Import finished. added=', added, 'skipped=', skipped);
			console.log('entries length after import (preview 5):', entries.length, entries.slice(0,5));
			// force a full render and save in case previous renders were skipped
			renderTable();
			saveState();
			if (wkSupabaseSyncController) {
				await wkSupabaseSyncController.syncNow();
			}
			if (added === 0) {
				let msg = 'Nenhuma linha importada.';
				if (skipped > 0) msg += ' Linhas puladas: ' + skipped + '. Veja console para amostra.';
				alert(msg);
			} else {
				alert('Importação concluída. Linhas adicionadas: ' + added + (skipped ? (', puladas: ' + skipped) : ''));
			}
			if (sample.length) console.warn('Amostra de linhas puladas:', sample);
		} catch (err) {
			reportSupabaseSyncError('Erro ao ler/importar a planilha', err);
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
	reader.onload = async function(e) {
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
					id: generateLocalRecordId(),
					unidade: String(unidade).trim(),
					produto: String(produto).trim(),
					total: _normalizeDecimalString(String(total))
				});
			});

			renderResumoVolumeTable();
			saveLocalStateOnly();
			if (wkSupabaseSyncController) {
				await wkSupabaseSyncController.syncResumoVolumeImport();
			}
		} catch (err) {
			reportSupabaseSyncError('Erro ao ler/importar o resumo', err);
			alert('Erro ao ler o resumo: ' + err.message);
		}
	};
	reader.readAsArrayBuffer(file);
}

function normalizePreenchimentoHeader(value) {
	return normalizeLookupText(value).toLowerCase();
}

function findPreenchimentoHeader(headers, names) {
	const wanted = names.map(normalizePreenchimentoHeader);
	return headers.find(header => wanted.includes(normalizePreenchimentoHeader(header))) || null;
}

function getPreenchimentoValue(row, header) {
	return header ? String(row[header] ?? '').trim() : '';
}

function getFirstTwoNameKey(value) {
	const normalized = String(value || '')
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
	return normalized.split(/\s+/).filter(Boolean).slice(0, 2).join('');
}

function isSameDriverByFirstTwoNames(inputName, fleetName) {
	const inputKey = getFirstTwoNameKey(inputName);
	const fleetKey = getFirstTwoNameKey(fleetName);
	return Boolean(inputKey && fleetKey && inputKey === fleetKey);
}

function isPartialDriverNameMatch(inputName, fleetName) {
	const inputTokens = String(inputName || '')
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
		.split(/\s+/)
		.filter(Boolean);
	const fleetTokens = String(fleetName || '')
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
		.split(/\s+/)
		.filter(Boolean);
	if (!inputTokens.length || !fleetTokens.length) return false;
	return inputTokens.every(token => fleetTokens.includes(token));
}

function findMotoristaForPreenchimento(motorista) {
	const nameNorm = normalizeLookupText(motorista);
	const activeFleet = frota.filter(item => item.ativo !== false);
	const alias = MOTORISTA_ALIASES[nameNorm];
	if (alias) {
		return activeFleet.find(item => normalizeLookupText(item.motoristaCpf) === normalizeLookupText(alias.cpf))
			|| activeFleet.find(item => normalizeLookupText(item.motoristaNome) === normalizeLookupText(alias.nome))
			|| {
				motoristaNome: alias.nome,
				motoristaCpf: alias.cpf
			};
	}
	const byName = nameNorm
		? activeFleet.filter(item => isSameDriverByFirstTwoNames(motorista, item.motoristaNome))
		: [];
	const byPartialName = nameNorm
		? activeFleet.filter(item => isPartialDriverNameMatch(motorista, item.motoristaNome))
		: [];

	const uniqueDriverByCpf = matches => {
		const withCpf = matches.filter(item => normalizeLookupText(item.motoristaCpf));
		const cpfs = new Set(withCpf.map(item => normalizeLookupText(item.motoristaCpf)));
		return cpfs.size === 1 ? withCpf[0] : null;
	};

	return uniqueDriverByCpf(byName)
		|| uniqueDriverByCpf(byPartialName)
		|| (byName.length === 1 ? byName[0] : null)
		|| (byPartialName.length === 1 ? byPartialName[0] : null);
}

function findCavaloForPreenchimento(placa) {
	const plateNorm = normalizeLookupText(placa);
	if (!plateNorm) return null;
	const matches = frota
		.filter(item => item.ativo !== false)
		.filter(item => normalizeLookupText(item.veiculo) === plateNorm);
	return matches.length === 1 ? matches[0] : null;
}

function renderPreenchimentoTable() {
	const table = document.getElementById('tabelaPreenchimento');
	if (!table) return;
	const thead = table.querySelector('thead');
	const tbody = table.querySelector('tbody');
	thead.innerHTML = '';
	tbody.innerHTML = '';
	if (!preenchimentoHeaders.length) return;
	atualizarOpcoesFiltrosPreenchimento();
	const headerRow = thead.insertRow();
	const selectAllCell = document.createElement('th');
	const selectAll = document.createElement('input');
	selectAll.type = 'checkbox';
	selectAll.setAttribute('aria-label', 'Selecionar todas as linhas exibidas');
	const filteredRows = obterLinhasFiltradasPreenchimento();
	selectAll.checked = filteredRows.length > 0 && filteredRows.every(({ rowIndex }) => preenchimentoLinhasSelecionadas.has(rowIndex));
	selectAll.addEventListener('change', event => selecionarLinhasPreenchimentoVisiveis(event.currentTarget.checked));
	selectAllCell.appendChild(selectAll);
	headerRow.appendChild(selectAllCell);
	preenchimentoHeaders.forEach(header => {
		const cell = document.createElement('th');
		cell.textContent = header;
		headerRow.appendChild(cell);
	});
	filteredRows.slice(0, 100).forEach(({ row, rowIndex }) => {
		if (row.__spacer) {
			const spacerRow = tbody.insertRow();
			spacerRow.className = 'preenchimento-spacer-row';
			const spacerCell = spacerRow.insertCell();
			spacerCell.colSpan = preenchimentoHeaders.length;
			spacerCell.textContent = '';
			return;
		}
		const tableRow = tbody.insertRow();
		const selectionCell = tableRow.insertCell();
		const selectionInput = document.createElement('input');
		selectionInput.type = 'checkbox';
		selectionInput.checked = preenchimentoLinhasSelecionadas.has(rowIndex);
		selectionInput.setAttribute('aria-label', `Selecionar linha ${rowIndex + 1}`);
		selectionInput.addEventListener('change', event => {
			if (event.currentTarget.checked) preenchimentoLinhasSelecionadas.add(rowIndex);
			else preenchimentoLinhasSelecionadas.delete(rowIndex);
			atualizarEstadoEdicaoEmLote();
		});
		selectionCell.appendChild(selectionInput);
		preenchimentoHeaders.forEach(header => {
			const cell = tableRow.insertCell();
			if (['VALOR UNITÁRIO', 'DISTRIBUIDOR', 'BASE'].includes(header)) {
				const input = document.createElement('input');
				input.type = 'text';
				input.value = String(row[header] ?? '');
				input.className = 'preenchimento-editable-cell';
				input.dataset.rowIndex = String(rowIndex);
				input.dataset.field = header;
				input.setAttribute('aria-label', `${header}, linha ${rowIndex + 1}`);
				input.addEventListener('keydown', event => {
					if (event.key === 'Enter') {
						event.preventDefault();
						event.currentTarget.blur();
					}
				});
				input.addEventListener('blur', event => {
					salvarEdicaoPreenchimento(rowIndex, header, event.currentTarget.value);
				});
				cell.appendChild(input);
				return;
			}
			cell.textContent = String(row[header] ?? '');
		});
	});
	atualizarEstadoEdicaoEmLote();
}

function selecionarLinhasPreenchimentoVisiveis(selected) {
	obterLinhasFiltradasPreenchimento().slice(0, 100).forEach(({ rowIndex }) => {
		if (selected) preenchimentoLinhasSelecionadas.add(rowIndex);
		else preenchimentoLinhasSelecionadas.delete(rowIndex);
	});
	renderPreenchimentoTable();
}

function atualizarEstadoEdicaoEmLote() {
	const toolbar = document.getElementById('preenchimentoEdicaoLote');
	if (toolbar) toolbar.classList.toggle('is-active', preenchimentoLinhasSelecionadas.size > 0);
	const count = document.getElementById('preenchimentoSelecionadasCount');
	if (count) count.textContent = `${preenchimentoLinhasSelecionadas.size} linha(s) selecionada(s)`;
}

function aplicarEdicaoEmLotePreenchimento() {
	const selectedRows = [...preenchimentoLinhasSelecionadas]
		.map(index => preenchimentoRows[index])
		.filter(row => row && !row.__spacer);
	if (!selectedRows.length) {
		alert('Selecione ao menos uma linha para editar em lote.');
		return;
	}
	const values = {
		'VALOR UNITÁRIO': document.getElementById('edicaoLoteValorUnitario')?.value.trim() || '',
		DISTRIBUIDOR: document.getElementById('edicaoLoteDistribuidor')?.value.trim() || '',
		BASE: document.getElementById('edicaoLoteBase')?.value.trim() || ''
	};
	const fields = Object.keys(values).filter(field => values[field] !== '');
	if (!fields.length) {
		alert('Informe ao menos um valor para aplicar às linhas selecionadas.');
		return;
	}
	selectedRows.forEach(row => fields.forEach(field => { row[field] = values[field]; }));
	saveLocalStateOnly();
	renderPreenchimentoTable();
}

function obterLinhasFiltradasPreenchimento() {
	const unidadeSelect = document.getElementById('filtroPreenchimentoUnidade');
	const unidadesFiltro = unidadeSelect
		? [...unidadeSelect.querySelectorAll('input[type="checkbox"]:checked')]
			.map(input => normalizeLookupText(input.value)).filter(Boolean)
		: [];
	const produtoFiltro = normalizeLookupText(document.getElementById('filtroPreenchimentoProduto')?.value);
	return preenchimentoRows
		.map((row, rowIndex) => ({ row, rowIndex }))
		.filter(({ row }) => {
			if (row.__spacer) return false;
			const unidadeOk = !unidadesFiltro.length || unidadesFiltro.some(filtro => isSamePreenchimentoUnit(row.UNIDADE, filtro));
			const produtoOk = !produtoFiltro || normalizeLookupText(row.PRODUTO) === produtoFiltro;
			return unidadeOk && produtoOk;
		});
}

function isSamePreenchimentoUnit(rowUnit, filterUnit) {
	const rowKey = normalizeLookupText(rowUnit);
	const filterKey = normalizeLookupText(filterUnit);
	if (!rowKey || !filterKey) return false;
	if (rowKey === filterKey) return true;
	if ((filterKey === 'regional' && rowKey === 'regionalderivados')
		|| (filterKey === 'regionalderivados' && rowKey === 'regional')) return true;
	const rowCnpj = getKnownUnitCnpj(rowUnit).replace(/\D/g, '');
	const filterCnpj = getKnownUnitCnpj(filterUnit).replace(/\D/g, '');
	return Boolean(rowCnpj && filterCnpj && rowCnpj === filterCnpj);
}

function atualizarOpcoesFiltrosPreenchimento() {
	const unidadeSelect = document.getElementById('filtroPreenchimentoUnidade');
	const produtoSelect = document.getElementById('filtroPreenchimentoProduto');
	if (!unidadeSelect || !produtoSelect) return;
	const unidadesAtuais = [...unidadeSelect.querySelectorAll('input[type="checkbox"]:checked')]
		.map(input => normalizeLookupText(input.value));
	const produtoAtual = produtoSelect.value;
	const unidadesDaPlanilha = preenchimentoRows
		.filter(row => !row.__spacer)
		.map(row => String(row.UNIDADE || '').trim())
		.filter(Boolean);
	const unidadesFixas = [
		'PLANALTINA',
		'RIO VERDE',
		'ANAPOLIS',
		'CAMPINORTE',
		'NIQUELANDIA',
		'REGIONAL',
		'REGIONAL DERIVADOS',
		'JARAGUA',
		'JATAI',
		'CATALAO',
		'GOIANESIA',
		'KBW',
		'WK 14',
		'QUERENCIA',
		'QUERENCIA MT'
	];
	const unidades = [...new Map([...unidadesFixas, ...unidadesDaPlanilha]
		.filter(Boolean)
		.map(value => [normalizeLookupText(value), value])).values()]
		.sort((left, right) => left.localeCompare(right));
	const produtos = [...new Set(preenchimentoRows
		.filter(row => !row.__spacer)
		.map(row => String(row.PRODUTO || '').trim())
		.filter(Boolean))]
		.sort((left, right) => left.localeCompare(right));
	unidadeSelect.innerHTML = `
		<label class="preenchimento-unidade-opcao preenchimento-unidade-todas">
			<input type="checkbox" value="" ${unidadesAtuais.length ? '' : 'checked'}
				onchange="alterarFiltroUnidadesPreenchimento(this)">
			<span>Todas as unidades</span>
		</label>
		${unidades.map((value, index) => `
			<label class="preenchimento-unidade-opcao">
				<input type="checkbox" value="${escapeHtml(value)}"
					${unidadesAtuais.includes(normalizeLookupText(value)) ? 'checked' : ''}
					onchange="alterarFiltroUnidadesPreenchimento(this)">
				<span>${escapeHtml(value)}</span>
			</label>
		`).join('')}`;
	produtoSelect.innerHTML = '<option value="">Todos os produtos</option>'
		+ produtos.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
	if (produtos.some(value => normalizeLookupText(value) === normalizeLookupText(produtoAtual))) produtoSelect.value = produtoAtual;
}

function aplicarFiltrosPreenchimento() {
	renderPreenchimentoTable();
}

function alterarFiltroUnidadesPreenchimento() {
	const unidadeSelect = document.getElementById('filtroPreenchimentoUnidade');
	if (unidadeSelect) {
		const inputs = [...unidadeSelect.querySelectorAll('input[type="checkbox"]')];
		const allOption = inputs.find(input => input.value === '');
		const selectedSpecific = inputs.some(input => input.value !== '' && input.checked);
		if (allOption) allOption.checked = !selectedSpecific;
		if (selectedSpecific && allOption) allOption.checked = false;
	}
	aplicarFiltrosPreenchimento();
}

function limparFiltrosPreenchimento() {
	const unidadeSelect = document.getElementById('filtroPreenchimentoUnidade');
	const produtoSelect = document.getElementById('filtroPreenchimentoProduto');
	if (unidadeSelect) {
		[...unidadeSelect.querySelectorAll('input[type="checkbox"]')].forEach(input => {
			input.checked = input.value === '';
		});
	}
	if (produtoSelect) produtoSelect.value = '';
	renderPreenchimentoTable();
}

function salvarEdicaoPreenchimento(rowIndex, header, value) {
	if (!['VALOR UNITÁRIO', 'DISTRIBUIDOR', 'BASE'].includes(header)) return;
	const normalizedValue = String(value ?? '').trim();
	const selectedIndexes = [...preenchimentoLinhasSelecionadas]
		.filter(index => preenchimentoRows[index] && !preenchimentoRows[index].__spacer);
	const targetIndexes = selectedIndexes.includes(rowIndex) ? selectedIndexes : [rowIndex];
	let changed = false;
	targetIndexes.forEach(index => {
		const row = preenchimentoRows[index];
		if (row[header] !== normalizedValue) {
			row[header] = normalizedValue;
			changed = true;
		}
	});
	if (!changed) return;
	saveLocalStateOnly();
	if (targetIndexes.length > 1) renderPreenchimentoTable();
}

function salvarEdicoesPreenchimentoEmAberto() {
	document.querySelectorAll('#tabelaPreenchimento input.preenchimento-editable-cell').forEach(input => {
		const rowIndex = Number(input.dataset.rowIndex);
		const header = input.dataset.field;
		if (!Number.isInteger(rowIndex) || !header) return;
		const selectedIndexes = [...preenchimentoLinhasSelecionadas]
			.filter(index => preenchimentoRows[index] && !preenchimentoRows[index].__spacer);
		const targetIndexes = selectedIndexes.includes(rowIndex) ? selectedIndexes : [rowIndex];
		targetIndexes.forEach(index => {
			if (preenchimentoRows[index]) preenchimentoRows[index][header] = String(input.value || '').trim();
		});
	});
	saveLocalStateOnly();
}

function importarPreenchimentoAutomatico() {
	const input = document.getElementById('fileInputPreenchimento');
	if (!input || !input.files || input.files.length === 0) {
		alert('Escolha a planilha que será preenchida.');
		return;
	}
	const reader = new FileReader();
	reader.onload = function(event) {
		try {
			const workbook = XLSX.read(new Uint8Array(event.target.result), { type: 'array' });
			const sheet = workbook.Sheets[workbook.SheetNames[0]];
			const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
			let sourceHeaders = rows.length ? Object.keys(rows[0]) : [];
			if (!sourceHeaders.length) throw new Error('A planilha não possui uma linha de cabeçalho.');
			const dataHeader = findPreenchimentoHeader(sourceHeaders, ['data', 'date', 'dt', 'dia', 'data carga', 'data da carga']);
			const dataHeaderIndex = dataHeader ? sourceHeaders.indexOf(dataHeader) : -1;
			if (dataHeaderIndex >= 0) {
				sourceHeaders = sourceHeaders.slice(0, dataHeaderIndex + 1);
			} else {
				while (sourceHeaders.length && /^__empty(?:_\d+)?$/i.test(sourceHeaders[sourceHeaders.length - 1])) {
					sourceHeaders.pop();
				}
			}

			const unidadeHeader = findPreenchimentoHeader(sourceHeaders, ['unidade', 'unit', 'posto', 'estabelecimento']);
			const cnpjHeader = findPreenchimentoHeader(sourceHeaders, ['cnpj', 'cnpj unidade', 'cnpj do estabelecimento']);
			const produtoHeader = findPreenchimentoHeader(sourceHeaders, ['produto', 'produto combustível', 'produto combustivel', 'combustível', 'combustivel']);
			const motoristaHeader = findPreenchimentoHeader(sourceHeaders, ['motorista', 'nome motorista', 'condutor', 'driver']);
			const placaHeader = findPreenchimentoHeader(sourceHeaders, [
				'placa',
				'placa cavalo',
				'placa do cavalo',
				'placa do caminhão',
				'placa caminhao',
				'veiculo',
				'caminhao',
				'caminhão',
				'cavalo'
			]);
			const skipHeader = header => {
				const normalized = normalizePreenchimentoHeader(header);
				return normalized === 'cnpj'
					|| normalized === 'cpf'
					|| normalized.startsWith('carreta')
					|| normalized === 'placadacarreta1'
					|| normalized === 'placadacarreta2';
			};
			const volumeHeader = findPreenchimentoHeader(sourceHeaders, ['volume', 'volume m3', 'volume m³', 'quantidade', 'quantidade m3']);
			const referenciaFields = [
				{ key: 'valorUnitario', header: findPreenchimentoHeader(sourceHeaders, ['valor unitário', 'valor unitario', 'valor litro', 'preço', 'preco']), canonical: 'VALOR UNITÁRIO' },
				{ key: 'distribuidor', header: findPreenchimentoHeader(sourceHeaders, ['distribuidora', 'distribuidor']), canonical: 'DISTRIBUIDOR' },
				{ key: 'base', header: findPreenchimentoHeader(sourceHeaders, ['base']), canonical: 'BASE' }
			];
			const outputHeaders = [
				{ canonical: 'UNIDADE', source: unidadeHeader },
				{ canonical: 'CNPJ' },
				{ canonical: 'PRODUTO', source: produtoHeader },
				{ canonical: 'VOLUME', source: volumeHeader },
				...referenciaFields.map(field => ({ canonical: field.canonical, source: field.header, reference: field })),
				{ canonical: 'MOTORISTA', source: motoristaHeader },
				{ canonical: 'CPF' },
				{ canonical: 'PLACA', source: placaHeader },
				{ canonical: 'CARRETA 1' },
				{ canonical: 'CARRETA 2' },
				{ canonical: 'DATA', source: dataHeader }
			];
			preenchimentoHeaders = outputHeaders.map(field => field.canonical);
			let unmatched = 0;
			const filledRows = rows.map(row => {
				const unidade = getPreenchimentoValue(row, unidadeHeader);
				const motorista = getPreenchimentoValue(row, motoristaHeader);
				const placa = getPreenchimentoValue(row, placaHeader);
				const produto = getPreenchimentoValue(row, produtoHeader);
				const cnpj = getPreenchimentoValue(row, cnpjHeader);
				const referencia = findReferenciaCompra(unidade, produto, cnpj);
				const motoristaItem = findMotoristaForPreenchimento(motorista);
				const cavaloItem = findCavaloForPreenchimento(placa);
				if ((motorista && !motoristaItem) || (placa && !cavaloItem)) unmatched++;
				const output = {};
				outputHeaders.forEach(field => {
					if (field.canonical === 'CNPJ') {
						output[field.canonical] = getCnpjForUnidade(unidade);
						return;
					}
					if (field.canonical === 'CPF') {
						output[field.canonical] = motoristaItem?.motoristaCpf || '';
						return;
					}
					if (field.canonical === 'CARRETA 1') {
						output[field.canonical] = cavaloItem?.carreta1 || '';
						return;
					}
					if (field.canonical === 'CARRETA 2') {
						output[field.canonical] = cavaloItem?.carreta2 || '';
						return;
					}
					if (field.reference) {
						const manualValue = field.source ? getPreenchimentoValue(row, field.source) : '';
						output[field.canonical] = manualValue || (!referencia ? '' : field.reference.key === 'valorUnitario'
							? formatReferenceValue(referencia[field.reference.key])
							: referencia[field.reference.key] || '');
						return;
					}
					if (field.canonical === 'MOTORISTA') {
						output[field.canonical] = motoristaItem?.motoristaNome || motorista;
						return;
					}
					output[field.canonical] = field.canonical === 'DATA'
						? formatDateForDisplay(normalizeDateValue(row[field.source]))
						: field.source ? row[field.source] ?? '' : '';
				});
				return output;
			});
			preenchimentoRows = [];
			preenchimentoLinhasSelecionadas.clear();
			let previousDriver = '';
			filledRows.forEach(row => {
				const currentDriver = normalizeLookupText(row.MOTORISTA || '');
				if (preenchimentoRows.length && currentDriver && previousDriver && currentDriver !== previousDriver) {
					preenchimentoRows.push({ __spacer: true });
				}
				preenchimentoRows.push(row);
				if (currentDriver) previousDriver = currentDriver;
			});
			renderPreenchimentoTable();
			saveLocalStateOnly();
			const status = document.getElementById('preenchimentoStatus');
			if (status) {
				const statusText = !frota.length
					? `${preenchimentoRows.length} linhas processadas, mas a tabela de frota não está carregada no Supabase.`
					: `${preenchimentoRows.length} linhas processadas.${unmatched ? ` ${unmatched} sem CPF do motorista ou carretas do cavalo encontrados.` : ' Todos os CPFs e carretas foram encontrados.'}`;
				status.innerHTML = `<span class="preenchimento-status-dot"></span><span>${statusText}</span>`;
			}
		} catch (error) {
			console.error(error);
			alert(`Erro ao processar a planilha: ${error.message}`);
		}
	};
	reader.readAsArrayBuffer(input.files[0]);
}

function exportarPreenchimentoAutomatico() {
	if (!preenchimentoRows.length || !preenchimentoHeaders.length) {
		alert('Importe uma planilha antes de exportar.');
		return;
	}
	const exportRows = preenchimentoRows.map(row => row.__spacer ? {} : row);
	const worksheet = XLSX.utils.json_to_sheet(exportRows, { header: preenchimentoHeaders });
	const workbook = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(workbook, worksheet, 'Preenchido');
	XLSX.writeFile(workbook, 'wk_compras_preenchimento_automatico.xlsx');
}

function limparPreenchimentoAutomatico() {
	preenchimentoHeaders = [];
	preenchimentoRows = [];
	preenchimentoLinhasSelecionadas.clear();
	const input = document.getElementById('fileInputPreenchimento');
	if (input) input.value = '';
	renderPreenchimentoTable();
	const status = document.getElementById('preenchimentoStatus');
	if (status) status.innerHTML = '<span class="preenchimento-status-dot"></span><span>Nenhuma planilha processada.</span>';
	saveLocalStateOnly();
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
	saveLocalStateOnly();
	if (currentSupabaseUser && wkSupabaseSyncController) {
		wkSupabaseSyncController.syncResumoVolumeImport().catch(error => console.error('Erro ao sincronizar resumo vazio:', error));
	}
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
	const fMotor = (activeFilters.motorista || '').toLowerCase().trim();
	return entries.filter(entry => {
		if (entry.removed) return false;
		if (fUnidade && !String(entry.unidade || '').toLowerCase().includes(fUnidade)) return false;
		if (fDistrib && !String(entry.distribuidora || '').toLowerCase().includes(fDistrib)) return false;
		if (fMotor && !String(entry.motorista || '').toLowerCase().includes(fMotor)) return false;
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
				CNPJ: getCnpjForUnidade(entry.unidade),
				Total: '0'
			};
		}
		groups[key].Total = addDecimalStrings(groups[key].Total, entry.totalStr);
	});
	const rows = Object.values(groups).map(group => ({
		CNPJ: group.CNPJ,
		Unidade: group.Unidade,
		Distribuidora: group.Distribuidora,
		Total: formatarMoedaFromDecimalString(group.Total)
	}));
	if (!rows.length) { alert('Não há dados visíveis para exportar.'); return; }
	const header = ['CNPJ','Distribuidora','Unidade','Total'].join(';');
	const csv = [header].concat(rows.map(row => [row.CNPJ, row.Distribuidora, row.Unidade, row.Total].map(value => '"' + String(value).replace(/"/g, '""') + '"').join(';'))).join('\r\n');
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
		Motorista: entry.motorista || '',
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
	const targetEntries = getEntryEditTargets(id);
	if (!targetEntries.length) return alert('Carga não encontrada');

	targetEntries.forEach(entry => {
		boletos.push({
			id: entry.id,
			dbId: null,
			source_carga_id: entry.dbId || null,
			unidade: entry.unidade,
			etiqueta: entry.etiqueta || '',
			data: entry.data || '',
			selected: false,
			removed: false,
			distribuidora: entry.distribuidora,
			motorista: entry.motorista || '',
			produto: entry.produto,
			volumeNorm: entry.volumeNorm,
			litrosStr: entry.litrosStr,
			valorNorm: entry.valorNorm,
			totalStr: entry.totalStr
		});
		entry.removed = true;
		entry.selected = false;
	});

	renderTable();
	renderTabelaBoleto();
	saveState();
}

function moverSelecionadosParaBoleto() {
	const selected = entries.find(entry => !entry.removed && entry.selected);
	if (!selected) {
		alert('Selecione ao menos uma carga na tabela principal.');
		return;
	}
	moverParaBoleto(selected.id);
}

function applyBoletoFilters() {
	boletoFilters.unidade = document.getElementById('filterBoletoUnidade').value || '';
	boletoFilters.distribuidora = document.getElementById('filterBoletoDistribuidora').value || '';
	boletoFilters.produto = document.getElementById('filterBoletoProduto').value || '';
	boletoFilters.motorista = document.getElementById('filterBoletoMotorista') ? document.getElementById('filterBoletoMotorista').value || '' : '';
	renderTabelaBoleto();
	saveState();
}

function clearBoletoFilters() {
	boletoFilters = { unidade: '', distribuidora: '', produto: '', motorista: '' };
	const fu = document.getElementById('filterBoletoUnidade');
	const fd = document.getElementById('filterBoletoDistribuidora');
	const fm = document.getElementById('filterBoletoMotorista');
	const fp = document.getElementById('filterBoletoProduto');
	if (fu) fu.value = '';
	if (fd) fd.value = '';
	if (fm) fm.value = '';
	if (fp) {
		try { fp.selectedIndex = 0; } catch (e) { fp.value = ''; }
	}
	renderTabelaBoleto();
	saveState();
}

function escapeHtmlAttr(value) {
	return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getCreditoSaldo(item) {
	if (!item) return '0';
	const pago = _normalizeDecimalString(String(item.valorPago || item.totalStr || '0'));
	const novoTotal = _normalizeDecimalString(String(item.novoTotalStr || item.totalStr || '0'));
	return subtractDecimalStrings(pago, novoTotal);
}

function getCreditoResumo(saldoStr) {
	const saldo = _normalizeDecimalString(String(saldoStr || '0'));
	if (saldo === '0') {
		return { tipo: 'zero', label: 'Sem saldo', valor: formatarMoedaFromDecimalString('0') };
	}
	if (saldo.startsWith('-')) {
		return { tipo: 'negativo', label: 'A pagar', valor: formatarMoedaFromDecimalString(saldo.replace('-', '')) };
	}
	return { tipo: 'positivo', label: 'Crédito', valor: formatarMoedaFromDecimalString(saldo) };
}

function renderTabelaCredito() {
	const tbody = document.querySelector('#tabelaCredito tbody');
	if (!tbody) return;
	const totalSaldoEl = document.getElementById('totalCreditoSaldo');
	tbody.innerHTML = '';
	let totalSaldo = '0';

	if (!creditos.length) {
		const row = tbody.insertRow();
		row.innerHTML = '<td colspan="16" style="text-align:center; color: var(--muted);">Nenhuma carga movida para crédito de fornecedor.</td>';
		if (totalSaldoEl) totalSaldoEl.innerText = 'R$ 0,00';
		return;
	}

	creditos.forEach(item => {
		item.valorPago = _normalizeDecimalString(String(item.valorPago || item.totalStr || '0'));
		item.produtoOriginal = item.produtoOriginal || item.produto || 'GC';
		item.novoProduto = item.novoProduto || item.produto || item.produtoOriginal || 'GC';
		item.novoVolumeNorm = _normalizeDecimalString(String(item.novoVolumeNorm || item.volumeNorm || '0'));
		item.novoLitrosStr = multiplyDecimalStrings(item.novoVolumeNorm, '1000');
		item.novoValorNorm = _normalizeDecimalString(String(item.novoValorNorm || item.valorNorm || '0'));
		item.novoTotalStr = _normalizeDecimalString(String(item.novoTotalStr || multiplyDecimalStrings(item.novoLitrosStr || '0', item.novoValorNorm || '0')));
		const saldoStr = getCreditoSaldo(item);
		totalSaldo = addDecimalStrings(totalSaldo, saldoStr);
		const resumo = getCreditoResumo(saldoStr);
		const row = tbody.insertRow();
		row.innerHTML = `
			<td><input type="checkbox" data-credito-id="${item.id}" onchange="toggleSelectCredito('${item.id}', this.checked)" ${item.selected ? 'checked' : ''}></td>
			<td>${escapeHtmlAttr(item.unidade || '')}</td>
			<td><input type="date" value="${String(item.data || '').slice(0,10)}" onchange="updateCreditoDateById('${item.id}', this.value)" style="width:120px;" /></td>
			<td>${escapeHtmlAttr(item.distribuidora || '')}</td>
			<td><input type="text" value="${escapeHtmlAttr(item.motorista || '')}" onchange="setCreditoMotorista('${item.id}', this.value)" style="width:120px;" /></td>
			<td>${escapeHtmlAttr(item.produtoOriginal || '')}</td>
			<td>
				<select onchange="setCreditoProduto('${item.id}', this.value)">
					<option value="GC" ${item.novoProduto === 'GC' ? 'selected' : ''}>GC</option>
					<option value="GAD" ${item.novoProduto === 'GAD' ? 'selected' : ''}>GAD</option>
					<option value="S-500" ${item.novoProduto === 'S-500' ? 'selected' : ''}>S-500</option>
					<option value="S-10" ${item.novoProduto === 'S-10' ? 'selected' : ''}>S-10</option>
					<option value="ETANOL" ${item.novoProduto === 'ETANOL' ? 'selected' : ''}>ETANOL</option>
				</select>
			</td>
			<td>${item.volumeNorm || '0'}</td>
			<td><input type="number" step="0.001" value="${String(item.novoVolumeNorm || '0')}" onchange="updateCreditoVolumeById('${item.id}', this.value)" style="width:90px;" /></td>
			<td>${formatNumberFromDecimalString(item.litrosStr || '0')}</td>
			<td>${formatNumberFromDecimalString(item.novoLitrosStr || '0')}</td>
			<td class="money-unit">${formatarMoedaFromDecimalString(item.valorPago || item.totalStr || '0')}</td>
			<td><input type="text" inputmode="decimal" value="${String(item.novoValorNorm || '0').replace('.', ',')}" onchange="updateCreditoValorById('${item.id}', this.value)" style="width:90px;" /></td>
			<td class="money-total">${formatarMoedaFromDecimalString(item.novoTotalStr || '0')}</td>
			<td class="${resumo.tipo === 'positivo' ? 'credito-positivo' : resumo.tipo === 'negativo' ? 'credito-negativo' : 'credito-zero'}">${resumo.label}: ${resumo.valor}</td>
			<td style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;"><button class="delete-btn" style="background:#10b981;" onclick="desfazerCredito('${item.id}')">Voltar</button><button class="delete-btn" onclick="removerCredito('${item.id}')">Excluir</button></td>
		`;
	});

	if (totalSaldoEl) totalSaldoEl.innerText = formatarMoedaFromDecimalString(totalSaldo);
	renderTabelaSaldoCredito();
	saveState();
}

function moverParaCredito(id) {
	const entry = entries.find(e => String(e.id) === String(id));
	if (!entry || entry.removed) return alert('Carga não encontrada');

	creditos.push({
		id: entry.id,
		dbId: null,
		source_carga_id: entry.dbId || null,
		unidade: entry.unidade,
		etiqueta: entry.etiqueta || '',
		data: entry.data || '',
		distribuidora: entry.distribuidora,
		motorista: entry.motorista || '',
		produtoOriginal: entry.produto,
		produto: entry.produto,
		novoProduto: entry.produto,
		volumeNorm: entry.volumeNorm,
		novoVolumeNorm: _normalizeDecimalString(String(entry.volumeNorm || '0')),
		litrosStr: entry.litrosStr,
		novoLitrosStr: _normalizeDecimalString(String(entry.litrosStr || '0')),
		valorNorm: entry.valorNorm,
		totalStr: entry.totalStr,
		valorPago: _normalizeDecimalString(String(entry.totalStr || '0')),
		novoValorNorm: _normalizeDecimalString(String(entry.valorNorm || '0')),
		novoTotalStr: _normalizeDecimalString(String(entry.totalStr || '0')),
		selected: false,
		removed: false
	});

	entry.removed = true;
	renderTable();
	renderTabelaCredito();
}

function getCreditoPositivoItems() {
	return creditos.filter(item => {
		const saldo = _normalizeDecimalString(String(getCreditoSaldo(item) || '0'));
		return saldo.startsWith('-') === false && saldo !== '0';
	});
}

function renderTabelaSaldoCredito() {
	const tbody = document.querySelector('#tabelaSaldoCredito tbody');
	if (!tbody) return;
	tbody.innerHTML = '';
	const groups = {};
	getCreditoPositivoItems().forEach(item => {
		const saldo = _normalizeDecimalString(String(getCreditoSaldo(item) || '0'));
		if (saldo === '0' || saldo.startsWith('-')) return;
		const key = `${String(item.unidade || '').trim()}|||${String(item.distribuidora || '').trim()}`;
		if (!groups[key]) {
			groups[key] = { unidade: item.unidade || '', distribuidora: item.distribuidora || '', saldo: '0' };
		}
		groups[key].saldo = addDecimalStrings(groups[key].saldo, saldo);
	});

	const rows = Object.values(groups);
	if (!rows.length) {
		const row = tbody.insertRow();
		row.innerHTML = '<td colspan="3" style="text-align:center; color: var(--muted);">Nenhum saldo de crédito disponível.</td>';
		return;
	}

	rows.forEach(rowData => {
		const row = tbody.insertRow();
		row.innerHTML = `
			<td>${escapeHtmlAttr(rowData.unidade)}</td>
			<td>${escapeHtmlAttr(rowData.distribuidora)}</td>
			<td>${formatarMoedaFromDecimalString(rowData.saldo)}</td>
		`;
	});

	const labels = rows.map(r => `${r.unidade} / ${r.distribuidora}`);
	const data = rows.map(r => Number(parseFloat(r.saldo) || 0));
	const ctx = document.getElementById('saldoCreditoChart');
	if (!ctx) return;

	if (saldoCreditoChart) {
		saldoCreditoChart.destroy();
	}

	saldoCreditoChart = new Chart(ctx, {
		type: 'bar',
		data: {
			labels,
			datasets: [{
				label: 'Saldo em crédito',
				data,
				backgroundColor: ['#10b981','#2563eb','#f59e0b','#8b5cf6','#ef4444','#06b6d4'],
				borderRadius: 6
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
				legend: { display: false }
			}
		}
	});
}

function setCreditoProduto(id, produto) {
	const item = creditos.find(i => String(i.id) === String(id));
	if (!item) return;
	item.novoProduto = String(produto || item.produtoOriginal || 'GC');
	item.produto = item.novoProduto;
	saveState();
	renderTabelaCredito();
}

function setCreditoMotorista(id, motorista) {
	const item = creditos.find(i => String(i.id) === String(id));
	if (!item) return;
	item.motorista = String(motorista || '').trim();
	saveState();
	renderTabelaCredito();
}

function updateCreditoDateById(id, dateValue) {
	const selectedItems = creditos.filter(i => i.selected);
	const targetItems = selectedItems.length > 0
		? selectedItems
		: [creditos.find(i => String(i.id) === String(id))].filter(Boolean);
	if (!targetItems.length) return;

	const normalized = normalizeDateValue(dateValue);
	if (!normalized || !isValidMonthDay(normalized)) {
		alert('Data inválida');
		renderTabelaCredito();
		return;
	}

	targetItems.forEach(item => {
		item.data = normalized;
	});

	saveState();
	renderTabelaCredito();
}

function toggleSelectCredito(id, checked) {
	const item = creditos.find(i => String(i.id) === String(id));
	if (!item) return;
	item.selected = Boolean(checked);
	saveState();
	renderTabelaCredito();
}

function toggleSelectAllCredito(checkbox) {
	const checked = Boolean(checkbox.checked);
	creditos.forEach(item => item.selected = checked);
	saveState();
	renderTabelaCredito();
}

function clearCreditoSelection() {
	creditos.forEach(item => item.selected = false);
	const chk = document.getElementById('selectAllCreditoCheckbox');
	if (chk) chk.checked = false;
	saveState();
	renderTabelaCredito();
}

function updateCreditoVolumeById(id, valorRaw) {
	const selectedItems = creditos.filter(i => i.selected);
	const targetItems = selectedItems.length > 0
		? selectedItems
		: [creditos.find(i => String(i.id) === String(id))].filter(Boolean);
	if (!targetItems.length) return;

	const novo = _normalizeDecimalString(String(valorRaw ?? ''));
	if (novo === '0' && String(valorRaw ?? '').trim() !== '0') {
		alert('Volume inválido');
		renderTabelaCredito();
		return;
	}
	
	targetItems.forEach(item => {
		item.novoVolumeNorm = novo;
		item.novoLitrosStr = multiplyDecimalStrings(item.novoVolumeNorm, '1000');
		item.novoTotalStr = multiplyDecimalStrings(item.novoLitrosStr, item.novoValorNorm);
	});
	
	saveState();
	renderTabelaCredito();
}

function updateCreditoValorById(id, valorRaw) {
	const selectedItems = creditos.filter(i => i.selected);
	const targetItems = selectedItems.length > 0
		? selectedItems
		: [creditos.find(i => String(i.id) === String(id))].filter(Boolean);
	if (!targetItems.length) return;

	const novo = _normalizeDecimalString(String(valorRaw ?? ''));
	if (novo === '0' && String(valorRaw ?? '').trim() !== '0') {
		alert('Valor inválido');
		renderTabelaCredito();
		return;
	}
	
	targetItems.forEach(item => {
		item.novoValorNorm = novo;
		item.novoTotalStr = multiplyDecimalStrings(item.novoLitrosStr, item.novoValorNorm);
	});
	
	saveState();
	renderTabelaCredito();
}

function updateCreditoPago(id, valorRaw) {
	const item = creditos.find(i => String(i.id) === String(id));
	if (!item) return;
	const novo = _normalizeDecimalString(String(valorRaw ?? ''));
	if (novo === '0' && String(valorRaw ?? '').trim() !== '0') {
		alert('Valor inválido');
		renderTabelaCredito();
		return;
	}
	item.valorPago = novo;
	saveState();
	renderTabelaCredito();
}

function desfazerCredito(id) {
	const index = creditos.findIndex(i => String(i.id) === String(id));
	if (index === -1) return;
	const item = creditos[index];
	creditos.splice(index, 1);
	const entry = entries.find(e => String(e.id) === String(id));
	if (entry) {
		entry.removed = false;
	}
	renderTable();
	renderTabelaCredito();
}

function removerCredito(id) {
	const index = creditos.findIndex(i => String(i.id) === String(id));
	if (index === -1) return;
	creditos.splice(index, 1);
	const entry = entries.find(e => String(e.id) === String(id));
	if (entry) {
		entry.removed = true;
	}
	renderTabelaCredito();
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
	const fMotor = (boletoFilters.motorista || '').toLowerCase().trim();
	let visibleCount = 0;
	
	boletos.forEach(boleto => {
		if (boleto.removed) return;
		if (fUnidade && !String(boleto.unidade || '').toLowerCase().includes(fUnidade)) return;
		if (fDistrib && !String(boleto.distribuidora || '').toLowerCase().includes(fDistrib)) return;
		if (fMotor && !String(boleto.motorista || '').toLowerCase().includes(fMotor)) return;
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
			<td><input type="date" value="${String(boleto.data || '').slice(0, 10)}" onchange="updateBoletoDateById('${boleto.id}', this.value)" style="width:120px;" /></td>
			<td>${boleto.distribuidora}</td>
			<td><input type="text" value="${escapeHtmlAttr(boleto.motorista || '')}" onchange="setBoletoMotorista('${boleto.id}', this.value)" style="width:120px;" /></td>
			<td>${boleto.produto}</td>
			<td>${boleto.volumeNorm}</td>
			<td>${formatNumberFromDecimalString(boleto.litrosStr)}</td>
			<td class="money-unit"><input type="text" inputmode="decimal" value="${String(boleto.valorNorm || '0').replace('.', ',')}" onchange="updateBoletoValorById('${boleto.id}', this.value)" style="width:90px;" /></td>
			<td class="money-total">${formatarMoedaFromDecimalString(boleto.totalStr)}</td>
			<td style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;"><button class="delete-btn" style="background:#f59e0b;" onclick="editBoletoValorById('${boleto.id}')">Editar</button><button class="delete-btn" style="background:#06b6d4;" onclick="desfazerBoleto('${boleto.id}')">Desfazer</button><button class="delete-btn" onclick="removerBoleto('${boleto.id}')">Excluir</button></td>
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

function getBoletoEditTargets(id) {
	const selectedBoletos = boletos.filter(boleto => boleto.selected && !boleto.removed);
	if (selectedBoletos.length > 0) return selectedBoletos;
	const boleto = boletos.find(item => String(item.id) === String(id) && !item.removed);
	return boleto ? [boleto] : [];
}

function setBoletoUnidade(id, unidade) {
	const targets = getBoletoEditTargets(id);
	if (!targets.length) return;
	targets.forEach(boleto => {
		boleto.unidade = String(unidade || '').trim();
	});
	saveState();
	renderTabelaBoleto();
}

function setBoletoMotorista(id, motorista) {
	const targets = getBoletoEditTargets(id);
	if (!targets.length) return;
	targets.forEach(boleto => {
		boleto.motorista = String(motorista || '').trim();
	});
	saveState();
	renderTabelaBoleto();
}

function setBoletoLabel(id, label) {
	const targets = getBoletoEditTargets(id);
	if (!targets.length) return;
	targets.forEach(boleto => {
		boleto.etiqueta = String(label || '');
	});
	saveState();
	renderTabelaBoleto();
}

function updateBoletoValorById(id, valorRaw) {
	const targetBoletos = getBoletoEditTargets(id);
	if (!targetBoletos.length) return;

	const novo = _normalizeDecimalString(String(valorRaw ?? ''));
	if (novo === '0' && String(valorRaw ?? '').trim() !== '0') {
		alert('Valor inválido');
		renderTabelaBoleto();
		return;
	}

	targetBoletos.forEach(boleto => {
		boleto.valorNorm = novo;
		boleto.totalStr = multiplyDecimalStrings(boleto.litrosStr, boleto.valorNorm);
	});

	saveState();
	renderTabelaBoleto();
}

function updateBoletoDateById(id, dateValue) {
	const targetBoletos = getBoletoEditTargets(id);
	if (!targetBoletos.length) return;

	const normalized = normalizeDateValue(dateValue);
	if (!normalized || !isValidMonthDay(normalized)) {
		alert('Data inválida');
		renderTabelaBoleto();
		return;
	}

	targetBoletos.forEach(boleto => {
		boleto.data = normalized;
	});

	saveState();
	renderTabelaBoleto();
}

function editBoletoValorById(id) {
	const targets = getBoletoEditTargets(id);
	if (!targets.length) return alert('Carga não encontrada');
	const input = prompt(`Informe o novo Valor por litro para ${targets.length > 1 ? 'as cargas selecionadas' : 'esta carga'} (use ponto para decimais):`, targets[0].valorNorm);
	if (input === null) return;
	const novo = _normalizeDecimalString(String(input));
	if (novo === '0' && String(input).trim() !== '0') {
		alert('Valor inválido');
		return;
	}
	targets.forEach(boleto => {
		boleto.valorNorm = novo;
		boleto.totalStr = multiplyDecimalStrings(boleto.litrosStr, boleto.valorNorm);
	});
	saveState();
	renderTabelaBoleto();
}

function editSelectedBoletoValor() {
	const selected = boletos.find(boleto => boleto.selected && !boleto.removed);
	if (!selected) {
		alert('Selecione ao menos uma carga no boleto.');
		return;
	}
	editBoletoValorById(selected.id);
}

function toggleSelectAllBoleto(checkbox) {
	const checked = Boolean(checkbox.checked);
	const fUnidade = (boletoFilters.unidade || '').toLowerCase().trim();
	const fDistrib = (boletoFilters.distribuidora || '').toLowerCase().trim();
	const fProd = (boletoFilters.produto || '').toLowerCase().trim();
	const fMotor = (boletoFilters.motorista || '').toLowerCase().trim();
	boletos.forEach(boleto => {
		if (boleto.removed) return;
		if (fUnidade && !String(boleto.unidade || '').toLowerCase().includes(fUnidade)) return;
		if (fDistrib && !String(boleto.distribuidora || '').toLowerCase().includes(fDistrib)) return;
		if (fMotor && !String(boleto.motorista || '').toLowerCase().includes(fMotor)) return;
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

function desfazerBoleto(id) {
	const boletoIndex = boletos.findIndex(b => String(b.id) === String(id));
	if (boletoIndex === -1) return;
	
	boletos[boletoIndex].removed = false;
	boletos[boletoIndex].selected = false;
	
	const entry = entries.find(e => String(e.id) === String(id));
	if (entry) {
		entry.removed = false;
	}
	
	renderTable();
	renderTabelaBoleto();
	saveState();
}

function removerBoleto(id) {
	const targetBoletos = getBoletoEditTargets(id);
	if (!targetBoletos.length) return;
	
	// Soft delete: mantém o registro local para que o Supabase receba o tombstone
	// e não recrie a carga em uma sincronização posterior.
	targetBoletos.forEach(boleto => {
		boleto.removed = true;
		boleto.selected = false;
		const entry = entries.find(e => String(e.id) === String(boleto.id));
		if (entry) entry.removed = true;
	});
	
	renderTable();
	renderTabelaBoleto();
	saveState();
}

function removerBoletosSelecionados() {
	const selected = boletos.filter(boleto => boleto.selected && !boleto.removed);
	if (!selected.length) {
		alert('Selecione ao menos uma carga no boleto.');
		return;
	}
	removerBoleto(selected[0].id);
}

function getBoletoExportRows() {
	const groups = {};
	boletos.forEach(boleto => {
		if (boleto.removed) return;
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
	if (!boletos.some(b => !b.removed)) { alert('Não há cargas no boleto para exportar.'); return; }

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
	if (!boletos.some(b => !b.removed)) { alert('Não há cargas no boleto para exportar.'); return; }
	
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
		rows.forEach((item, rowIndex) => {
			const row = tbody.insertRow();
			row.className = `resumo-unit-row resumo-tone-${rowIndex % 6}`;
			row.innerHTML = `
				<td class="resumo-unit-cell">${item.Unidade}</td>
				<td class="resumo-number-cell">${formatNumberFromDecimalString(item.GC)}</td>
				<td class="resumo-number-cell">${formatNumberFromDecimalString(item.GAD)}</td>
				<td class="resumo-number-cell">${formatNumberFromDecimalString(item.ETANOL)}</td>
				<td class="resumo-number-cell">${formatNumberFromDecimalString(item['S-500'])}</td>
				<td class="resumo-number-cell">${formatNumberFromDecimalString(item['S-10'])}</td>
				<td class="resumo-number-cell resumo-total-cell">${formatNumberFromDecimalString(item.Total)}</td>
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
	salvarEdicoesPreenchimentoEmAberto();
	if (entries.length > 0 || boletos.length > 0) {
		event.preventDefault();
		event.returnValue = '';
	}
});

window.addEventListener('load', function () {
	setupPasswordRecoveryUi();
	loadState();
	initializeSupabaseApp().catch(error => {
		console.error(error);
		setAuthMessage('Erro ao inicializar o login.');
		updateAuthUi(false);
	});
});
