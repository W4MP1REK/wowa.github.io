const firebaseConfig = {
    apiKey: "AIzaSyDyg9Hh1mrxhat1rLlnzyNrAffhuy4gByA",
    authDomain: "kurier-app-d8fcf.firebaseapp.com",
    projectId: "kurier-app-d8fcf",
    storageBucket: "kurier-app-d8fcf.firebasestorage.app",
    messagingSenderId: "462482275945",
    appId: "1:462482275945:web:dcfecca1b0804bd2502cf8"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
db.enablePersistence().catch(err => console.error("Firestore persistence error:", err));

document.addEventListener('DOMContentLoaded', () => {
    const authModal = document.getElementById('auth-modal');
    const appContent = document.getElementById('app-content');
    const loginForm = document.getElementById('login-form');
    const logoutBtn = document.getElementById('logout-btn');

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
        });
    });

    if (sessionStorage.getItem('auth_ok') === 'true') {
        showApp();
    } else {
        showLogin();
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const inputPin = String(document.getElementById('pin-input').value).trim();
            try {
                const doc = await db.collection('kurier_app').doc('settings').get();
                let validPin = "1234";
                if (doc.exists && doc.data().pin !== undefined) {
                    validPin = String(doc.data().pin).trim();
                }
                if (inputPin === validPin) {
                    sessionStorage.setItem('auth_ok', 'true');
                    showApp();
                } else {
                    alert('Błędny PIN!');
                    document.getElementById('pin-input').value = '';
                }
            } catch (error) {
                alert('Błąd PIN: ' + error.message);
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            sessionStorage.removeItem('auth_ok');
            location.reload();
        });
    }

    function showApp() {
        if (authModal) authModal.style.display = 'none';
        if (appContent) appContent.style.display = 'block';
        initApp();
    }

    function showLogin() {
        if (authModal) authModal.style.display = 'flex';
        if (appContent) appContent.style.display = 'none';
    }

    function initApp() {
        let currentDate = new Date();
        let selectedDateStr = formatDate(currentDate);
        let appData = { days: {}, payouts: {}, settings: {} };

        function getSettings() {
            const cfg = appData.settings || {};
            return {
                rateTier1: parseFloat(cfg.rateTier1) || 240,
                tier2Limit: parseInt(cfg.tier2Limit, 10) || 200,
                rateTier2: parseFloat(cfg.rateTier2) || 270,
                tier3Limit: parseInt(cfg.tier3Limit, 10) || 301,
                rateTier3: parseFloat(cfg.rateTier3) || 300,
                defaultSecRate: parseFloat(cfg.defaultSecRate) || 180,
                pin: cfg.pin || "1234"
            };
        }

        function calculateDayRate(firstShiftTotal, hasSecondShift = false, secondShiftRate = 0) {
            const count = parseInt(firstShiftTotal, 10) || 0;
            const set = getSettings();
            let rate = 0;

            if (count > 0) {
                if (count < set.tier2Limit) rate = set.rateTier1;
                else if (count < set.tier3Limit) rate = set.rateTier2;
                else rate = set.rateTier3;
            }

            if (hasSecondShift) {
                rate += (parseFloat(secondShiftRate) || set.defaultSecRate);
            }
            return rate;
        }

        function calculateWorkMinutes(startStr, endStr) {
            if (!startStr || !endStr) return 0;
            const [sH, sM] = startStr.split(':').map(Number);
            const [eH, eM] = endStr.split(':').map(Number);
            let start = sH * 60 + sM;
            let end = eH * 60 + eM;
            if (end < start) end += 24 * 60;
            return end - start;
        }

        db.collection('kurier_app').doc('main_data')
            .onSnapshot((doc) => {
                if (doc.exists) {
                    const data = doc.data();
                    appData.days = data.days || {};
                    appData.payouts = data.payouts || {};
                    appData.settings = data.settings || {};
                }
                loadSettingsToForm();
                renderCalendar();
                loadDayToForm(selectedDateStr);
                populateMonthSelector();
                renderStats();
                renderRecordsAndBadges();
            }, (err) => console.error("Błąd Firebase:", err));

        function formatDate(d) {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        document.querySelectorAll('.btn-now').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetId = e.target.dataset.target;
                const now = new Date();
                const hh = String(now.getHours()).padStart(2, '0');
                const mm = String(now.getMinutes()).padStart(2, '0');
                document.getElementById(targetId).value = `${hh}:${mm}`;
                calculateDailyTotals();
            });
        });

        document.getElementById('btn-today')?.addEventListener('click', () => {
            currentDate = new Date();
            selectedDateStr = formatDate(currentDate);
            updateMonthView();
        });

        function renderCalendar() {
            const grid = document.getElementById('calendar-grid');
            const monthTitle = document.getElementById('calendar-month-year');
            if (!grid || !monthTitle) return;

            grid.innerHTML = '';
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();

            const monthNames = ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"];
            monthTitle.textContent = `${monthNames[month]} ${year}`;

            const firstDay = new Date(year, month, 1).getDay();
            const startingDay = firstDay === 0 ? 6 : firstDay - 1;
            const totalDays = new Date(year, month + 1, 0).getDate();

            const daysOfWeek = ['Pn', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'];
            daysOfWeek.forEach(d => {
                const head = document.createElement('div');
                head.className = 'calendar-day-header';
                head.textContent = d;
                grid.appendChild(head);
            });

            for (let i = 0; i < startingDay; i++) {
                const empty = document.createElement('div');
                empty.className = 'calendar-day empty';
                grid.appendChild(empty);
            }

            const set = getSettings();

            for (let day = 1; day <= totalDays; day++) {
                const mStr = String(month + 1).padStart(2, '0');
                const dStr = String(day).padStart(2, '0');
                const dateStr = `${year}-${mStr}-${dStr}`;
                
                const cell = document.createElement('div');
                cell.className = 'calendar-day';
                if (dateStr === selectedDateStr) cell.classList.add('selected');

                const dayData = appData.days && appData.days[dateStr];
                
                if (dayData) {
                    const rawAddr = parseInt(dayData.address, 10) || 0;
                    const awizo = parseInt(dayData.awizo, 10) || 0;
                    const effectiveAddress = Math.max(0, rawAddr - awizo);

                    const firstShiftTotal = effectiveAddress + (parseInt(dayData.apmPudo || dayData.apm, 10) || 0) + (parseInt(dayData.pickups, 10) || 0);

                    if (firstShiftTotal >= set.tier3Limit) {
                        cell.classList.add('tier-high');
                    } else if (firstShiftTotal >= set.tier2Limit) {
                        cell.classList.add('tier-mid');
                    } else if (firstShiftTotal > 0 || dayData.secondShift) {
                        cell.classList.add('tier-low');
                    }

                    const hasNote = dayData.note && dayData.note.trim() !== "";
                    const noteHtml = hasNote ? `<span class="note-badge">📝</span>` : '';
                    const secondShiftHtml = dayData.secondShift ? `<span class="second-shift-tag">2Z</span>` : '';

                    cell.innerHTML = `
                        ${noteHtml}
                        <span>${day}</span>
                        ${secondShiftHtml}
                    `;
                } else {
                    cell.innerHTML = `<span>${day}</span>`;
                }

                cell.addEventListener('click', () => {
                    document.querySelectorAll('.calendar-day').forEach(c => c.classList.remove('selected'));
                    cell.classList.add('selected');
                    selectedDateStr = dateStr;
                    loadDayToForm(dateStr);
                });

                grid.appendChild(cell);
            }
        }

        function loadDayToForm(dateStr) {
            const title = document.getElementById('selected-date-title');
            if (title) title.textContent = `Wybrany dzień: ${dateStr}`;

            const set = getSettings();
            const dayData = (appData.days && appData.days[dateStr]) 
                ? appData.days[dateStr] 
                : { 
                    address: 0, apmPudo: 0, awizo: 0, pickups: 0, tips: 0, workStart: '', workEnd: '',
                    secondShift: false, secondWorkStart: '', secondWorkEnd: '', secondAddress: 0, secondApmPudo: 0, secondPickups: 0, 
                    secondShiftRate: set.defaultSecRate, note: '' 
                  };

            document.getElementById('work-start').value = dayData.workStart || '';
            document.getElementById('work-end').value = dayData.workEnd || '';
            document.getElementById('tips').value = dayData.tips !== undefined ? dayData.tips : 0;
            document.getElementById('address').value = dayData.address !== undefined ? dayData.address : 0;
            document.getElementById('apm-pudo').value = dayData.apmPudo !== undefined ? dayData.apmPudo : (dayData.apm || 0);
            document.getElementById('awizo').value = dayData.awizo !== undefined ? dayData.awizo : 0;
            document.getElementById('pickups').value = dayData.pickups !== undefined ? dayData.pickups : 0;
            document.getElementById('daily-note').value = dayData.note || '';

            const has2nd = Boolean(dayData.secondShift);
            const secondShiftCb = document.getElementById('second-shift');
            const secDetailsDiv = document.getElementById('second-shift-details');

            if (secondShiftCb) secondShiftCb.checked = has2nd;
            if (secDetailsDiv) secDetailsDiv.style.display = has2nd ? 'block' : 'none';

            document.getElementById('second-work-start').value = dayData.secondWorkStart || '';
            document.getElementById('second-work-end').value = dayData.secondWorkEnd || '';
            document.getElementById('second-address').value = dayData.secondAddress !== undefined ? dayData.secondAddress : 0;
            document.getElementById('second-apm-pudo').value = dayData.secondApmPudo !== undefined ? dayData.secondApmPudo : 0;
            document.getElementById('second-pickups').value = dayData.secondPickups !== undefined ? dayData.secondPickups : 0;
            document.getElementById('second-shift-rate').value = dayData.secondShiftRate !== undefined ? dayData.secondShiftRate : set.defaultSecRate;

            calculateDailyTotals();
        }

        function calculateDailyTotals() {
            const startStr1 = document.getElementById('work-start')?.value;
            const endStr1 = document.getElementById('work-end')?.value;
            let totalMinutes = calculateWorkMinutes(startStr1, endStr1);

            const hasSecondShift = document.getElementById('second-shift')?.checked || false;
            if (hasSecondShift) {
                const startStr2 = document.getElementById('second-work-start')?.value;
                const endStr2 = document.getElementById('second-work-end')?.value;
                totalMinutes += calculateWorkMinutes(startStr2, endStr2);
            }

            const hours = Math.floor(totalMinutes / 60);
            const mins = totalMinutes % 60;
            const totalHoursDecimal = totalMinutes / 60;

            document.getElementById('daily-hours').textContent = `${hours}h ${mins}m`;

            const rawAddr = parseInt(document.getElementById('address')?.value, 10) || 0;
            const apmPudo = parseInt(document.getElementById('apm-pudo')?.value, 10) || 0;
            const awizo = parseInt(document.getElementById('awizo')?.value, 10) || 0;
            const pick = parseInt(document.getElementById('pickups')?.value, 10) || 0;
            const tips = parseFloat(document.getElementById('tips')?.value) || 0;

            // ODEJMOWANIE AWIZO OD ADRESU:
            const effectiveAddress = Math.max(0, rawAddr - awizo);

            // Suma paczek z pierwszej zmiany bazuje na skorygowanym adresie:
            const firstShiftTotal = effectiveAddress + apmPudo + pick;

            const secAddr = hasSecondShift ? (parseInt(document.getElementById('second-address')?.value, 10) || 0) : 0;
            const secApmPudo = hasSecondShift ? (parseInt(document.getElementById('second-apm-pudo')?.value, 10) || 0) : 0;
            const secPick = hasSecondShift ? (parseInt(document.getElementById('second-pickups')?.value, 10) || 0) : 0;
            const secRate = hasSecondShift ? (parseFloat(document.getElementById('second-shift-rate')?.value) || 0) : 0;

            const secondShiftTotal = secAddr + secApmPudo + secPick;
            const totalParcels = firstShiftTotal + secondShiftTotal;

            const baseRate = calculateDayRate(firstShiftTotal, hasSecondShift, secRate);
            const totalEarn = baseRate + tips;

            document.getElementById('daily-total-parcels').textContent = totalParcels;
            document.getElementById('daily-rate').textContent = `${totalEarn.toFixed(2)} zl ${tips > 0 ? `(w tym ${tips}zl tip)` : ''}`;

            if (totalHoursDecimal > 0) {
                const pace = Math.round(totalParcels / totalHoursDecimal);
                const hourlyRate = (totalEarn / totalHoursDecimal).toFixed(2);
                document.getElementById('daily-pace').textContent = `${pace} paczek/h`;
                document.getElementById('daily-hourly-rate').textContent = `${hourlyRate} zl/h`;
            } else {
                document.getElementById('daily-pace').textContent = `0 paczek/h`;
                document.getElementById('daily-hourly-rate').textContent = `0.00 zl/h`;
            }
        }

        ['address', 'apm-pudo', 'awizo', 'pickups', 'tips', 'work-start', 'work-end', 
         'second-work-start', 'second-work-end', 'second-address', 'second-apm-pudo', 'second-pickups', 'second-shift-rate'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', calculateDailyTotals);
                el.addEventListener('change', calculateDailyTotals);
            }
        });

        document.getElementById('second-shift')?.addEventListener('change', (e) => {
            const secDetailsDiv = document.getElementById('second-shift-details');
            if (secDetailsDiv) secDetailsDiv.style.display = e.target.checked ? 'block' : 'none';
            calculateDailyTotals();
        });

        document.getElementById('daily-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!appData.days) appData.days = {};

            const hasSecondShift = document.getElementById('second-shift')?.checked || false;

            appData.days[selectedDateStr] = {
                workStart: document.getElementById('work-start')?.value || '',
                workEnd: document.getElementById('work-end')?.value || '',
                tips: parseFloat(document.getElementById('tips')?.value) || 0,
                address: parseInt(document.getElementById('address')?.value, 10) || 0,
                apmPudo: parseInt(document.getElementById('apm-pudo')?.value, 10) || 0,
                awizo: parseInt(document.getElementById('awizo')?.value, 10) || 0,
                pickups: parseInt(document.getElementById('pickups')?.value, 10) || 0,
                secondShift: hasSecondShift,
                secondWorkStart: document.getElementById('second-work-start')?.value || '',
                secondWorkEnd: document.getElementById('second-work-end')?.value || '',
                secondAddress: parseInt(document.getElementById('second-address')?.value, 10) || 0,
                secondApmPudo: parseInt(document.getElementById('second-apm-pudo')?.value, 10) || 0,
                secondPickups: parseInt(document.getElementById('second-pickups')?.value, 10) || 0,
                secondShiftRate: parseFloat(document.getElementById('second-shift-rate')?.value) || 0,
                note: document.getElementById('daily-note')?.value || ''
            };

            try {
                await db.collection('kurier_app').doc('main_data').set(appData, { merge: true });
                if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
                alert('Zapisano dzień!');
            } catch(err) {
                alert('Błąd zapisu: ' + err.message);
            }
        });

        function updateMonthView() {
            renderCalendar();
            loadDayToForm(selectedDateStr);
            populateMonthSelector();
            renderStats();
        }

        document.getElementById('prev-month')?.addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() - 1);
            updateMonthView();
        });

        document.getElementById('next-month')?.addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() + 1);
            updateMonthView();
        });

        function populateMonthSelector() {
            const select = document.getElementById('stats-month-select');
            if (!select) return;

            const visibleMonthStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
            select.innerHTML = '';

            const months = new Set();
            if (appData.days) {
                Object.keys(appData.days).forEach(d => months.add(d.substring(0, 7)));
            }
            months.add(visibleMonthStr);

            Array.from(months).sort().reverse().forEach(m => {
                const opt = document.createElement('option');
                opt.value = m;
                opt.textContent = m;
                select.appendChild(opt);
            });

            select.value = visibleMonthStr;
            select.onchange = renderStats;
        }

        function renderStats() {
            const select = document.getElementById('stats-month-select');
            const selectedMonth = select ? select.value : formatDate(currentDate).substring(0, 7);

            let mAddr = 0, mApmPudo = 0, mAwizo = 0, mPick = 0;
            let mEarnings = 0, mTips = 0, mMinutes = 0, mWorkingDays = 0, mSecondShiftDays = 0;

            if (appData.days) {
                Object.entries(appData.days).forEach(([date, d]) => {
                    if (date.startsWith(selectedMonth)) {
                        mWorkingDays++;

                        const rawAddr = parseInt(d.address, 10) || 0;
                        const apmPudo = parseInt(d.apmPudo, 10) || (parseInt(d.apm, 10) || 0);
                        const awizo = parseInt(d.awizo, 10) || 0;
                        const pick = parseInt(d.pickups, 10) || 0;
                        const tips = parseFloat(d.tips) || 0;

                        const effectiveAddress = Math.max(0, rawAddr - awizo);

                        const hasSecondShift = !!d.secondShift;
                        if (hasSecondShift) mSecondShiftDays++;

                        const secAddr = hasSecondShift ? (parseInt(d.secondAddress, 10) || 0) : 0;
                        const secApmPudo = hasSecondShift ? (parseInt(d.secondApmPudo, 10) || 0) : 0;
                        const secPick = hasSecondShift ? (parseInt(d.secondPickups, 10) || 0) : 0;
                        const secRate = hasSecondShift ? (parseFloat(d.secondShiftRate) || 0) : 0;

                        mAddr += (effectiveAddress + secAddr);
                        mApmPudo += (apmPudo + secApmPudo);
                        mAwizo += awizo;
                        mPick += (pick + secPick);
                        mTips += tips;

                        let dayMinutes = calculateWorkMinutes(d.workStart, d.workEnd);
                        if (hasSecondShift) dayMinutes += calculateWorkMinutes(d.secondWorkStart, d.secondWorkEnd);
                        mMinutes += dayMinutes;

                        const firstShiftTotal = effectiveAddress + apmPudo + pick;
                        mEarnings += calculateDayRate(firstShiftTotal, hasSecondShift, secRate);
                    }
                });
            }

            const mTotalParcels = mAddr + mApmPudo + mPick;
            const mHours = Math.round((mMinutes / 60) * 10) / 10;
            const mTotalHoursDecimal = mMinutes / 60;
            const mPace = mTotalHoursDecimal > 0 ? Math.round(mTotalParcels / mTotalHoursDecimal) : 0;
            const mHourlyRate = mTotalHoursDecimal > 0 ? ((mEarnings + mTips) / mTotalHoursDecimal).toFixed(2) : "0.00";

            const now = new Date();
            const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            const forecast = mWorkingDays > 0 ? ((mEarnings + mTips) / mWorkingDays) * Math.min(daysInMonth, 22) : 0;
            document.getElementById('stat-forecast').textContent = `~${forecast.toFixed(2)} zl`;

            document.getElementById('stat-monthly-earnings').textContent = `${mEarnings.toFixed(2)} zl`;
            document.getElementById('stat-monthly-tips').textContent = `${mTips.toFixed(2)} zl`;
            document.getElementById('stat-monthly-days').textContent = `${mWorkingDays} dni`;
            document.getElementById('stat-second-shift-days').textContent = `${mSecondShiftDays} dni`;
            document.getElementById('stat-monthly-hours').textContent = `${mHours}h`;
            document.getElementById('stat-monthly-pace').textContent = `${mPace} paczek/h`;
            document.getElementById('stat-monthly-hourly-rate').textContent = `${mHourlyRate} zl/h`;
            document.getElementById('stat-monthly-parcels').textContent = mTotalParcels;
            document.getElementById('stat-address').textContent = mAddr;
            document.getElementById('stat-apm-pudo').textContent = mApmPudo;
            document.getElementById('stat-awizo').textContent = mAwizo;
            document.getElementById('stat-pickups').textContent = mPick;

            document.getElementById('calculated-payout').value = `${mEarnings.toFixed(2)} zl`;

            const receivedInput = document.getElementById('received-payout');
            const diffInput = document.getElementById('payout-difference');
            
            const recVal = (appData.payouts && appData.payouts[selectedMonth] !== undefined) ? appData.payouts[selectedMonth] : '';
            if (receivedInput) receivedInput.value = recVal;

            if (recVal !== '') {
                const diff = parseFloat(recVal) - mEarnings;
                diffInput.value = `${diff >= 0 ? '+' : ''}${diff.toFixed(2)} zl`;
                diffInput.style.color = diff < 0 ? '#ef4444' : '#10b981';
            } else {
                diffInput.value = '0.00 zl';
                diffInput.style.color = 'inherit';
            }

            const goalInput = document.getElementById('monthly-goal-input');
            const goal = parseFloat(goalInput.value) || 6000;
            const totalWithTips = mEarnings + mTips;
            const progress = Math.min(Math.round((totalWithTips / goal) * 100), 100);

            const barFill = document.getElementById('progress-bar-fill');
            const barText = document.getElementById('progress-bar-text');
            if (barFill) barFill.style.width = `${progress}%`;
            if (barText) barText.textContent = `${progress}% (${totalWithTips.toFixed(0)} / ${goal} zl)`;
        }

        document.getElementById('monthly-goal-input')?.addEventListener('input', renderStats);

        document.getElementById('save-payout-btn')?.addEventListener('click', async () => {
            const select = document.getElementById('stats-month-select');
            const selectedMonth = select ? select.value : formatDate(currentDate).substring(0, 7);
            const val = parseFloat(document.getElementById('received-payout').value) || 0;

            if (!appData.payouts) appData.payouts = {};
            appData.payouts[selectedMonth] = val;

            try {
                await db.collection('kurier_app').doc('main_data').set(appData, { merge: true });
                renderStats();
                alert('Zapisano przelew!');
            } catch(err) {
                alert('Błąd zapisu: ' + err.message);
            }
        });

        // FUNKCJA GENERUJĄCA PODSUMOWANIE MIESIĄCA W FORMACIE PDF
        function generateMonthPDF() {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            const select = document.getElementById('stats-month-select');
            const selectedMonth = select ? select.value : formatDate(currentDate).substring(0, 7);
            const [yearStr, monthStr] = selectedMonth.split('-');
            const year = parseInt(yearStr, 10);
            const month = parseInt(monthStr, 10);

            const totalDays = new Date(year, month, 0).getDate();

            const tableRows = [];
            let totalMorningD2d = 0;
            let totalMorningPickup = 0;
            let totalMorningApm = 0;
            let totalEveningD2d = 0;
            let totalEveningPickup = 0;
            let totalPayout = 0;

            for (let day = 1; day <= totalDays; day++) {
                const dayPadded = String(day).padStart(2, '0');
                const dateKey = `${selectedMonth}-${dayPadded}`;
                const dateDisplay = `${dayPadded}.${monthStr}`;

                const dayData = appData.days && appData.days[dateKey];

                if (dayData) {
                    const rawAddr = parseInt(dayData.address, 10) || 0;
                    const awizo = parseInt(dayData.awizo, 10) || 0;
                    const effectiveAddress = Math.max(0, rawAddr - awizo);
                    const apmPudo = parseInt(dayData.apmPudo || dayData.apm, 10) || 0;
                    const pickups = parseInt(dayData.pickups, 10) || 0;

                    const morningD2d = effectiveAddress + apmPudo;

                    const has2nd = Boolean(dayData.secondShift);
                    const eveningD2d = has2nd ? ((parseInt(dayData.secondAddress, 10) || 0) + (parseInt(dayData.secondApmPudo, 10) || 0)) : 0;
                    const eveningPickup = has2nd ? (parseInt(dayData.secondPickups, 10) || 0) : 0;
                    const secRate = has2nd ? (parseFloat(dayData.secondShiftRate) || 0) : 0;

                    const firstShiftTotal = morningD2d + pickups;
                    const dayEarn = calculateDayRate(firstShiftTotal, has2nd, secRate);

                    totalMorningD2d += morningD2d;
                    totalMorningPickup += pickups;
                    totalMorningApm += 0;
                    totalEveningD2d += eveningD2d;
                    totalEveningPickup += eveningPickup;
                    totalPayout += dayEarn;

                    tableRows.push([
                        dateDisplay,
                        morningD2d > 0 ? morningD2d : '',
                        pickups > 0 ? pickups : '',
                        '',
                        eveningD2d > 0 ? eveningD2d : '',
                        eveningPickup > 0 ? eveningPickup : '',
                        dayEarn > 0 ? `${dayEarn.toFixed(2)} zl` : ''
                    ]);
                } else {
                    tableRows.push([dateDisplay, '', '', '', '', '', '']);
                }
            }

            tableRows.push([
                'Lacznie do wyplaty',
                totalMorningD2d || '',
                totalMorningPickup || '',
                totalMorningApm || '',
                totalEveningD2d || '',
                totalEveningPickup || '',
                `${totalPayout.toFixed(2)} zl`
            ]);

            doc.text(`Podsumowanie miesiaca: ${selectedMonth}`, 14, 15);

            doc.autoTable({
                startY: 20,
                head: [[
                    'Data',
                    'Rano\nD2D/APM',
                    'Odbior',
                    'APM',
                    'Wieczor',
                    'Odbior',
                    'Do wyplaty'
                ]],
                body: tableRows,
                theme: 'grid',
                styles: { fontSize: 8, halign: 'center' },
                headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
                didParseCell: function(data) {
                    if (data.row.index === tableRows.length - 1) {
                        data.cell.styles.fontStyle = 'bold';
                        data.cell.styles.fillColor = [230, 230, 230];
                    }
                }
            });

            doc.save(`Podsumowanie_${selectedMonth}_HolubievVolodymyr.pdf`);
        }

        document.getElementById('export-pdf-btn')?.addEventListener('click', generateMonthPDF);

        function renderRecordsAndBadges() {
            let maxParcels = 0, maxTip = 0, maxEarning = 0, maxPace = 0;
            let totalAddress = 0, totalSecondShifts = 0;

            if (appData.days) {
                Object.values(appData.days).forEach(d => {
                    const rawAddr = parseInt(d.address, 10) || 0;
                    const apmPudo = parseInt(d.apmPudo, 10) || (parseInt(d.apm, 10) || 0);
                    const awizo = parseInt(d.awizo, 10) || 0;
                    const pick = parseInt(d.pickups, 10) || 0;
                    const tips = parseFloat(d.tips) || 0;

                    const effectiveAddress = Math.max(0, rawAddr - awizo);

                    const has2nd = !!d.secondShift;
                    if (has2nd) totalSecondShifts++;

                    const secAddr = has2nd ? (parseInt(d.secondAddress, 10) || 0) : 0;
                    const secApmPudo = has2nd ? (parseInt(d.secondApmPudo, 10) || 0) : 0;
                    const secPick = has2nd ? (parseInt(d.secondPickups, 10) || 0) : 0;
                    const secRate = has2nd ? (parseFloat(d.secondShiftRate) || 0) : 0;

                    totalAddress += (effectiveAddress + secAddr);
                    const dayParcels = effectiveAddress + apmPudo + pick + secAddr + secApmPudo + secPick;

                    let dayMinutes = calculateWorkMinutes(d.workStart, d.workEnd);
                    if (has2nd) dayMinutes += calculateWorkMinutes(d.secondWorkStart, d.secondWorkEnd);
                    const dayHours = dayMinutes / 60;

                    const baseRate = calculateDayRate(effectiveAddress + apmPudo + pick, has2nd, secRate);
                    const totalEarn = baseRate + tips;

                    if (dayParcels > maxParcels) maxParcels = dayParcels;
                    if (tips > maxTip) maxTip = tips;
                    if (totalEarn > maxEarning) maxEarning = totalEarn;
                    if (dayHours > 0) {
                        const pace = Math.round(dayParcels / dayHours);
                        if (pace > maxPace) maxPace = pace;
                    }
                });
            }

            document.getElementById('rec-max-parcels').textContent = maxParcels;
            document.getElementById('rec-max-tip').textContent = `${maxTip.toFixed(2)} zl`;
            document.getElementById('rec-max-earning').textContent = `${maxEarning.toFixed(2)} zl`;
            document.getElementById('rec-max-pace').textContent = `${maxPace} paczek/h`;

            const badges = [
                { title: "Setka na Adres", desc: "Ponad 100 paczek adresowych łącznie", unlocked: totalAddress >= 100, icon: "🏠" },
                { title: "Król Tippingu", desc: "Zgarnij ponad 50 zl napiwku w 1 dzień", unlocked: maxTip >= 50, icon: "💰" },
                { title: "Dwuzmianowiec", desc: "Przepracuj co najmniej 5 drugich zmian", unlocked: totalSecondShifts >= 5, icon: "🌙" },
                { title: "Błyskawica", desc: "Osiągnij tempo powyżej 40 paczek/h", unlocked: maxPace >= 40, icon: "⚡" },
                { title: "Tytan Pracy", desc: "Zarób ponad 400 zl jednego dnia", unlocked: maxEarning >= 400, icon: "🏆" }
            ];

            const bContainer = document.getElementById('badges-container');
            if (bContainer) {
                bContainer.innerHTML = badges.map(b => `
                    <div class="badge-card ${b.unlocked ? 'unlocked' : ''}">
                        <div class="icon">${b.icon}</div>
                        <h4>${b.title}</h4>
                        <p>${b.desc}</p>
                    </div>
                `).join('');
            }
        }

        function loadSettingsToForm() {
            const set = getSettings();
            document.getElementById('cfg-rate-tier1').value = set.rateTier1;
            document.getElementById('cfg-tier2-limit').value = set.tier2Limit;
            document.getElementById('cfg-rate-tier2').value = set.rateTier2;
            document.getElementById('cfg-tier3-limit').value = set.tier3Limit;
            document.getElementById('cfg-rate-tier3').value = set.rateTier3;
            document.getElementById('cfg-default-sec-rate').value = set.defaultSecRate;
        }

        document.getElementById('settings-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newPin = document.getElementById('cfg-pin').value.trim();

            appData.settings = {
                rateTier1: parseFloat(document.getElementById('cfg-rate-tier1').value) || 240,
                tier2Limit: parseInt(document.getElementById('cfg-tier2-limit').value, 10) || 200,
                rateTier2: parseFloat(document.getElementById('cfg-rate-tier2').value) || 270,
                tier3Limit: parseInt(document.getElementById('cfg-tier3-limit').value, 10) || 301,
                rateTier3: parseFloat(document.getElementById('cfg-rate-tier3').value) || 300,
                defaultSecRate: parseFloat(document.getElementById('cfg-default-sec-rate').value) || 180,
                pin: newPin !== "" ? newPin : (appData.settings?.pin || "1234")
            };

            try {

                await db.collection('kurier_app').doc('main_data').set(appData, { merge: true });
                alert('Ustawienia i progi zostały pomyślnie zapisane!');
                renderCalendar();
                calculateDailyTotals();
                renderStats();
            } catch(err) {
                alert('Błąd zapisu ustawień: ' + err.message);
            }
        });
    }
});
