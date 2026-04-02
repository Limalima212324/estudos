// --- 1. ESTADO INICIAL ---
let appData = JSON.parse(localStorage.getItem('studyFlowData')) || {
    courses: [], totalStudySeconds: 0, dailyGoalSeconds: 7200, weeklyGoalSeconds: 36000, history: {}, roadmap: null
};

const sanitize = () => {
    appData.courses.forEach(c => {
        if (!c.topics) c.topics = [];
        if (!c.links) c.links = [];
        if (isNaN(c.totalTime)) c.totalTime = 0;
    });
    if (!appData.history) appData.history = {};
    if (isNaN(appData.totalStudySeconds)) appData.totalStudySeconds = 0;
};
sanitize();

let studyInterval = null, pomoInterval = null, myChart = null, distChart = null;
let activeCourseId = null, isStudyPaused = false, studySecondsCounter = 0, pomoSeconds = 25 * 60;
let startTime = null; // Nova variável para rastrear o início real

const save = () => localStorage.setItem('studyFlowData', JSON.stringify(appData));
const formatTime = (s) => `${Math.floor(s/3600).toString().padStart(2,'0')}:${Math.floor((s%3600)/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;

// --- 2. INTEGRAÇÃO COM ROADMAP ---
async function carregarRoadmap() {
    try {
        const resposta = await fetch('./json/roadmap_data.json');
        const dados = await resposta.json();
        if (!appData.roadmap) {
            appData.roadmap = dados;
        }
        renderizarRoadmap();
    } catch (erro) {
        console.error("Erro ao carregar Roadmap. Use o Live Server!", erro);
    }
}

function sincronizarComRoadmap(nomeTopico, concluido) {
    if (!appData.roadmap) return;
    
    const termoBusca = nomeTopico.toLowerCase();

    appData.roadmap.levels.forEach(level => {
        level.skills.forEach(skill => {
            const matchNome = termoBusca.includes(skill.name.toLowerCase());
            const matchItens = skill.items.some(item => termoBusca.includes(item.toLowerCase()));

            if (matchNome || matchItens) {
                skill.concluidoGlobal = concluido;
            }
        });
    });
    
    save();
    renderizarRoadmap();
}

function renderizarRoadmap() {
    const container = document.getElementById('roadmapView');
    if (!appData.roadmap || !container) return;

    container.innerHTML = appData.roadmap.levels.map(level => {
        const isLocked = level.status === "locked";
        return `
            <div class="p-5 rounded-2xl bg-[var(--card-bg)] shadow-lg mb-6 border-t-4 ${isLocked ? 'border-gray-500 opacity-50' : 'border-indigo-500'}">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-base font-bold">${level.title} ${isLocked ? '🔒' : '🚀'}</h3>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    ${level.skills.map(skill => `
                        <div class="p-3 rounded-xl border ${skill.concluidoGlobal ? 'border-green-500 bg-green-500/10' : 'border-slate-700'}">
                            <p class="font-bold text-[11px] mb-1">${skill.name} ${skill.concluidoGlobal ? '✅' : ''}</p>
                            <ul class="text-[9px] opacity-50">
                                ${skill.items.map(i => `<li>• ${i}</li>`).join('')}
                            </ul>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
}

// --- 3. GESTÃO DE CURSOS E CRONÔMETRO (ATUALIZADO PARA PRECISÃO) ---
function toggleStudyTimer(id) {
    if (activeCourseId && activeCourseId !== id) return alert("Finalize o atual!");
    
    if (activeCourseId === id && !isStudyPaused) {
        // PAUSAR: Limpa o intervalo e marca como pausado
        clearInterval(studyInterval); 
        isStudyPaused = true;
    } else {
        // INICIAR OU RETOMAR
        activeCourseId = id; 
        isStudyPaused = false;
        
        // Define o tempo de início baseado no que já foi contado (para não resetar ao despausar)
        startTime = Date.now() - (studySecondsCounter * 1000);

        studyInterval = setInterval(() => {
            // Calcula a diferença real de tempo desde o startTime
            const agora = Date.now();
            studySecondsCounter = Math.floor((agora - startTime) / 1000);
            
            const display = document.getElementById(`display-${id}`);
            if (display) display.innerText = formatTime(studySecondsCounter);
        }, 100); // Atualiza mais rápido (100ms) para ser mais fluído
    }
    renderCourses();
}

function stopStudy(id) {
    clearInterval(studyInterval);
    const c = appData.courses.find(x => x.id === id);
    const today = new Date().toLocaleDateString('pt-BR');
    
    // Adiciona o tempo contado ao curso e ao global
    c.totalTime += studySecondsCounter;
    appData.totalStudySeconds += studySecondsCounter;
    appData.history[today] = (appData.history[today] || 0) + studySecondsCounter;
    
    // Reset de variáveis de controle
    studySecondsCounter = 0; 
    activeCourseId = null; 
    isStudyPaused = false;
    startTime = null;

    save(); 
    renderCourses(); 
    updateDashboard(); 
    updateChart(); 
    updateWeeklyProgress(); 
    updateDistChart();
}

// --- 4. EDIÇÕES (CURSO, TÓPICO, LINK) ---
function toggleTopic(cid, tid) {
    const c = appData.courses.find(x=>x.id===cid);
    const t = c.topics.find(x=>x.id===tid);
    t.completed = !t.completed;
    sincronizarComRoadmap(t.title, t.completed);
    save(); renderCourses();
}

function renameCourse(id) {
    const c = appData.courses.find(x => x.id === id);
    const n = prompt("Novo nome:", c.name);
    if (n && n.trim()) { c.name = n.trim(); save(); renderCourses(); updateDistChart(); }
}

function renameTopic(courseId, topicId) {
    const c = appData.courses.find(x => x.id === courseId);
    const t = c.topics.find(x => x.id === topicId);
    const n = prompt("Renomear tópico:", t.title);
    if (n && n.trim()) { t.title = n.trim(); save(); renderCourses(); }
}

function editLink(courseId, linkId) {
    const c = appData.courses.find(x => x.id === courseId);
    const l = c.links.find(x => x.id === linkId);
    const nDesc = prompt("Novo nome:", l.desc); if(!nDesc) return;
    let nUrl = prompt("Nova URL:", l.url); if(!nUrl) return;
    if(!nUrl.startsWith('http')) nUrl = 'https://' + nUrl;
    l.desc = nDesc; l.url = nUrl; save(); renderCourses();
}

function deleteCourse(id) {
    if(confirm("Excluir curso?")) { appData.courses = appData.courses.filter(x => x.id !== id); save(); renderCourses(); updateDistChart(); }
}

function deleteTopic(cid, tid) {
    const c = appData.courses.find(x=>x.id===cid);
    c.topics = c.topics.filter(t=>t.id!==tid);
    save(); renderCourses();
}

function removeLink(cId, lId) {
    const c = appData.courses.find(x => x.id === cId);
    c.links = c.links.filter(l => l.id !== lId);
    save(); renderCourses();
}

// --- 5. RENDERIZAÇÃO DA UI ---
function renderCourses() {
    const grid = document.getElementById('courseGrid');
    if(!grid) return;
    grid.innerHTML = appData.courses.map(c => {
        const p = c.topics.length > 0 ? Math.round((c.topics.filter(t=>t.completed).length / c.topics.length)*100) : 0;
        const active = activeCourseId === c.id;
        return `
            <div class="p-5 rounded-2xl bg-[var(--card-bg)] shadow-lg border-2 ${active ? 'border-indigo-500' : 'border-transparent'}">
                <div class="flex justify-between items-start mb-2">
                    <div class="flex items-center gap-2 flex-1 min-w-0">
                        <h4 class="font-black text-base truncate">${c.name}</h4>
                        <button onclick="renameCourse('${c.id}')" class="text-xs opacity-40 hover:opacity-100">✏️</button>
                        <button onclick="deleteCourse('${c.id}')" class="text-xs opacity-40 hover:opacity-100">🗑️</button>
                    </div>
                    <span class="text-[9px] font-bold bg-indigo-500 text-white px-1.5 py-0.5 rounded ml-2">${p}%</span>
                </div>
                <div class="text-2xl font-mono font-bold text-center py-2 text-indigo-400" id="display-${c.id}">${active ? formatTime(studySecondsCounter) : '00:00:00'}</div>
                
                <div class="mt-3 border-t border-slate-100 dark:border-slate-800 pt-3">
                    <p class="text-[8px] uppercase font-bold opacity-40 mb-2 text-left">Checklist</p>
                    <div class="space-y-1 max-h-28 overflow-y-auto custom-scrollbar mb-3">
                        ${c.topics.map(t => `
                            <div class="flex items-center text-xs p-1 rounded hover:bg-slate-50 dark:hover:bg-slate-800/50 group">
                                <input type="checkbox" ${t.completed?'checked':''} onchange="toggleTopic('${c.id}','${t.id}')" class="mr-2 accent-indigo-500 w-3 h-3">
                                <span class="flex-1 truncate ${t.completed?'line-through opacity-30':''} text-left">${t.title}</span>
                                <button onclick="renameTopic('${c.id}','${t.id}')" class="text-[10px] opacity-0 group-hover:opacity-100 px-1">✏️</button>
                                <button onclick="deleteTopic('${c.id}','${t.id}')" class="text-red-400 text-[10px] opacity-0 group-hover:opacity-100">×</button>
                            </div>
                        `).join('')}
                    </div>
                    <div class="flex gap-2">
                        <input type="text" id="in-${c.id}" onkeyup="if(event.key==='Enter')addTopic('${c.id}')" placeholder="Novo tópico..." class="flex-1 bg-slate-50 dark:bg-slate-900 text-[10px] p-2 rounded outline-none border border-transparent focus:border-indigo-500/30">
                        <button onclick="addTopic('${c.id}')" class="bg-indigo-500 text-white px-3 rounded text-xs font-bold">+</button>
                    </div>
                </div>

                <div class="mt-3 border-t border-slate-100 dark:border-slate-800 pt-3">
                    <p class="text-[8px] uppercase font-bold opacity-40 mb-2 text-left">Materiais</p>
                    <div class="space-y-1 mb-3">
                        ${c.links.map(l => `
                            <div class="flex items-center justify-between text-[10px] p-1.5 bg-indigo-50/50 dark:bg-indigo-900/10 rounded group">
                                <a href="${l.url}" target="_blank" class="text-indigo-500 font-bold hover:underline truncate mr-2">🔗 ${l.desc}</a>
                                <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onclick="editLink('${c.id}','${l.id}')" class="text-[10px]">✏️</button>
                                    <button onclick="removeLink('${c.id}','${l.id}')" class="text-red-400 text-[10px]">×</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="grid grid-cols-1 gap-1.5">
                        <input type="text" id="desc-${c.id}" placeholder="Nome (ex: VideoAula)" class="bg-slate-50 dark:bg-slate-900 text-[9px] p-2 rounded outline-none border border-transparent focus:border-indigo-500/30">
                        <div class="flex gap-1">
                            <input type="text" id="url-${c.id}" placeholder="URL" class="flex-1 bg-slate-50 dark:bg-slate-900 text-[9px] p-2 rounded outline-none border border-transparent focus:border-indigo-500/30">
                            <button onclick="addLink('${c.id}')" class="bg-indigo-600 text-white px-3 rounded font-bold text-xs">+</button>
                        </div>
                    </div>
                </div>

                <div class="flex gap-2 pt-4">
                    ${!active ? `<button onclick="toggleStudyTimer('${c.id}')" class="w-full py-2 bg-indigo-600 text-white rounded-xl font-bold text-[10px]">INICIAR</button>` :
                    `<button onclick="toggleStudyTimer('${c.id}')" class="flex-1 py-2 ${isStudyPaused?'bg-blue-600':'bg-yellow-600'} text-white rounded-xl font-bold text-[10px]">${isStudyPaused?'RETOMAR':'PAUSAR'}</button>
                     <button onclick="stopStudy('${c.id}')" class="flex-1 py-2 bg-red-600 text-white rounded-xl font-bold text-[10px]">PARAR</button>`}
                </div>
            </div>
        `;
    }).join('');
}

// --- 6. GRÁFICOS ---
function updateDistChart() {
    const ctx = document.getElementById('distChart');
    if(!ctx) return;
    const data = appData.courses.filter(c => c.totalTime > 0);
    const labels = data.map(c => c.name);
    const values = data.map(c => Math.round(c.totalTime / 60));
    if (distChart) { distChart.data.labels = labels; distChart.data.datasets[0].data = values; distChart.update(); }
    else { distChart = new Chart(ctx.getContext('2d'), { type: 'doughnut', data: { labels, datasets: [{ data: values, backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ef4444'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: '75%' } }); }
}

function updateChart() {
    const ctx = document.getElementById('weeklyChart');
    if(!ctx) return;
    const labels = [], values = [];
    for (let i=6; i>=0; i--) {
        const d = new Date(); d.setDate(d.getDate()-i);
        const ds = d.toLocaleDateString('pt-BR');
        labels.push(ds.slice(0,5));
        values.push(Math.round((appData.history[ds]||0)/60));
    }
    if (myChart) { myChart.data.labels = labels; myChart.data.datasets[0].data = values; myChart.update(); }
    else { myChart = new Chart(ctx.getContext('2d'), { type: 'bar', data: { labels, datasets: [{ data: values, backgroundColor: '#6366f1', borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { display: false }, x: { grid: { display: false }, ticks: { font: { size: 9 } } } } } }); }
}

// --- 7. AUXILIARES ---
function updateDashboard() {
    const timeDisplay = document.getElementById('timeToday');
    if (timeDisplay) timeDisplay.innerText = formatTime(appData.totalStudySeconds);
    const goalBar = document.getElementById('goalBar');
    if (goalBar) goalBar.style.width = Math.min((appData.totalStudySeconds/appData.dailyGoalSeconds)*100, 100) + "%";
}

function updateWeeklyProgress() {
    let t = 0; for(let i=0; i<7; i++) { const d = new Date(); d.setDate(d.getDate() - i); t += (appData.history[d.toLocaleDateString('pt-BR')] || 0); }
    const p = Math.min((t / appData.weeklyGoalSeconds) * 100, 100);
    const progressBar = document.getElementById('weeklyProgressBar');
    if (progressBar) progressBar.style.width = p + "%";
    
    const msg = document.getElementById('milestoneMessage');
    if (!msg) return;

    if (p >= 100) msg.innerHTML = "🏆 <span class='text-green-500 font-black'>META BATIDA!</span>";
    else if (p >= 75) msg.innerHTML = "🔥 <span class='text-orange-500'>75%! Falta pouco para o topo!</span>";
    else if (p >= 50) msg.innerHTML = "🚀 <span class='text-yellow-500'>50%! Metade do caminho já foi.</span>";
    else if (p >= 25) msg.innerHTML = "💪 <span class='text-indigo-400'>25% concluído! Ritmo excelente.</span>";
    else msg.innerHTML = "🌱 <span class='opacity-70 text-indigo-400'>Cada minuto conta. Vamos pra cima!</span>";
}

const openModal = () => document.getElementById('modal').classList.remove('hidden');
const closeModal = () => document.getElementById('modal').classList.add('hidden');

function addCourse() { const n = document.getElementById('courseName').value; if(n.trim()){ appData.courses.push({id:"c-"+Date.now(), name:n, topics:[], links:[], totalTime:0}); save(); renderCourses(); closeModal(); document.getElementById('courseName').value=''; } }
function addTopic(id) { const i = document.getElementById(`in-${id}`); if(i.value.trim()){ const c = appData.courses.find(x => x.id === id); c.topics.push({id:"t-"+Date.now(), title: i.value, completed: false}); i.value = ''; save(); renderCourses(); } }

function addLink(cid) {
    const u = document.getElementById(`url-${cid}`), d = document.getElementById(`desc-${cid}`);
    if (!u.value || !d.value) return; let url = u.value; if (!url.startsWith('http')) url = 'https://' + url;
    appData.courses.find(x => x.id === cid).links.push({ id: "l-" + Date.now(), url, desc: d.value });
    u.value = ''; d.value = ''; save(); renderCourses();
}

function updateWeeklyGoal() { 
    const h = parseFloat(document.getElementById('weeklyGoalInput').value); 
    if (h > 0) { appData.weeklyGoalSeconds = h * 3600; save(); updateWeeklyProgress(); } 
}

function togglePomodoro() {
    const b = document.getElementById('btnPomo');
    if(pomoInterval) { clearInterval(pomoInterval); pomoInterval = null; b.innerText = "PLAY"; }
    else { b.innerText = "PAUSE"; pomoInterval = setInterval(() => { if(pomoSeconds>0) { pomoSeconds--; updatePomo(); } else { clearInterval(pomoInterval); resetPomodoro(); } }, 1000); }
}
function resetPomodoro() { clearInterval(pomoInterval); pomoInterval = null; pomoSeconds = 25 * 60; updatePomo(); document.getElementById('btnPomo').innerText = "PLAY"; }
function updatePomo() { document.getElementById('pomoDisplay').innerText = `${Math.floor(pomoSeconds/60).toString().padStart(2,'0')}:${(pomoSeconds%60).toString().padStart(2,'0')}`; }

// --- INICIALIZAÇÃO ---
window.onload = () => {
    carregarRoadmap();
    renderCourses();
    updateDashboard();
    updateChart();
    updateWeeklyProgress();
    updateDistChart();
    document.getElementById('themeToggle').onclick = () => document.documentElement.classList.toggle('dark');
};