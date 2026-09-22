/* Batu Kunci AI — Firebase AI Logic, browser-module version */
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAI, getGenerativeModel, GoogleAIBackend } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-ai.js";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app-check.js";

// Setelah membuat reCAPTCHA Enterprise Web key, tempel SITE KEY di sini.
// Domain produksi lo: mediacreative262-commits.github.io
const RECAPTCHA_ENTERPRISE_SITE_KEY = "6LfEPcgtAAAAAI1KD2_C55Pd6wJsXVv9fY-J0BH6";

const AI_MODEL = "gemini-3.8-flash";
const SYSTEM_INSTRUCTION = `Kamu adalah Batu Kunci AI, asisten untuk Tim Media Kreatif Angkatan 26.2 Administrasi Bisnis UT Bandung.
Bantu pengguna membuat caption, ide konten, brief desain, copywriting, struktur project, dan brainstorming.
Gunakan bahasa Indonesia yang natural, ringkas, praktis, dan mudah dipahami mahasiswa.
Jangan mengarang data tentang project. Kalau informasi kurang, nyatakan apa yang belum diketahui.
Jangan meminta password, token, API key, atau data sensitif.
Jika diminta sesuatu di luar konteks Media Kreatif, tetap bantu seperlunya tetapi jangan berpura-pura punya akses ke data yang tidak diberikan.`;

let model = null;
let chat = null;
let aiReady = false;

function $(id){ return document.getElementById(id); }
function addMessage(text, role="bot", extra=""){
  const box=$("ai-messages");
  const el=document.createElement("div");
  el.className=`ai-message ai-message-${role} ${extra}`.trim();
  el.textContent=text;
  box.appendChild(el);
  box.scrollTop=box.scrollHeight;
  return el;
}

function setError(message){
  const el=$("ai-error");
  el.textContent=message || "";
  el.classList.toggle("hidden", !message);
}

async function initAI(){
  try{
    const config=window.BK_FIREBASE_CONFIG;
    if(!config) throw new Error("Konfigurasi Firebase belum tersedia.");

    // Pakai app terpisah agar tidak mengganggu Firebase compat lama Batu Kunci.
    const aiAppName="batu-kunci-ai";
    const aiApp=getApps().find(a=>a.name===aiAppName) || initializeApp(config, aiAppName);

    if(RECAPTCHA_ENTERPRISE_SITE_KEY){
      initializeAppCheck(aiApp, {
        provider:new ReCaptchaEnterpriseProvider(RECAPTCHA_ENTERPRISE_SITE_KEY),
        isTokenAutoRefreshEnabled:true
      });
    }

    const ai=getAI(aiApp,{backend:new GoogleAIBackend()});
    model=getGenerativeModel(ai,{
      model:AI_MODEL,
      systemInstruction:SYSTEM_INSTRUCTION,
      generationConfig:{temperature:0.65,maxOutputTokens:700}
    });
    chat=model.startChat();
    aiReady=true;
  }catch(err){
    console.error("Batu Kunci AI init:",err);
    setError("AI belum siap. Pastikan Firebase AI Logic sudah diaktifkan dan App Check/reCAPTCHA Enterprise sudah dikonfigurasi.");
  }
}

window.openBatuKunciAI=function(){
  const modal=$("ai-modal");
  if(!modal) return;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden","false");
  setTimeout(()=>$("ai-input")?.focus(),50);
};
window.closeBatuKunciAI=function(){
  const modal=$("ai-modal");
  if(!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden","true");
};
window.useAISuggestion=function(text){
  const input=$("ai-input");
  input.value=text;
  input.focus();
};
window.sendBatuKunciAI=async function(event){
  event.preventDefault();
  const input=$("ai-input");
  const send=$("ai-send");
  const text=input.value.trim();
  if(!text || send.disabled) return;
  setError("");
  if(!aiReady){
    await initAI();
    if(!aiReady){ setError("Belum bisa terhubung ke Gemini. Cek setup Firebase AI Logic dan App Check dulu."); return; }
  }
  input.value="";
  input.style.height="auto";
  addMessage(text,"user");
  const loading=addMessage("Sedang mikir...","bot","ai-message-loading");
  send.disabled=true;
  try{
    const result=await chat.sendMessage(text);
    const answer=result.response.text() || "Gemini tidak mengembalikan teks.";
    loading.remove();
    addMessage(answer,"bot");
  }catch(err){
    console.error("Batu Kunci AI request:",err);
    loading.remove();
    setError("Request AI gagal: "+(err?.message || "error tidak diketahui")+". Kalau muncul 403, biasanya App Check belum benar.");
  }finally{
    send.disabled=false;
    input.focus();
  }
};

const input=document.getElementById("ai-input");
if(input){
  input.addEventListener("input",()=>{ input.style.height="auto"; input.style.height=Math.min(input.scrollHeight,110)+"px"; });
  input.addEventListener("keydown",e=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); $("ai-send")?.click(); } });
}

// Tidak melakukan request Gemini saat halaman dibuka. Model baru dibuat ketika AI dipakai.
window.addEventListener("load",()=>{ if(RECAPTCHA_ENTERPRISE_SITE_KEY) initAI(); });
