/* Batu Kunci AI — Firebase AI Logic, modular browser SDK
   IMPORTANT:
   - app.js uses the compat SDK for Auth/Firestore.
   - AI Logic uses the modular SDK. It therefore initializes its own named
     Firebase app and its own App Check instance, using the SAME Firebase
     project configuration and reCAPTCHA Enterprise site key.
*/
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app-check.js";
import { getAI, getGenerativeModel, GoogleAIBackend } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-ai.js";

const AI_MODEL = "gemini-3.8-flash";
const RECAPTCHA_ENTERPRISE_SITE_KEY = "6LcvasotAAAAAJhrXnUC7wMUMLT-Y65P2-vGRWB0";

const SYSTEM_INSTRUCTION = `Kamu adalah Batu Kunci AI, asisten untuk Tim Media Kreatif Angkatan 26.2 Administrasi Bisnis UT Bandung.
Bantu pengguna membuat caption, ide konten, brief desain, copywriting, struktur project, dan brainstorming.
Gunakan bahasa Indonesia yang natural, ringkas, praktis, dan mudah dipahami mahasiswa.
Jangan mengarang data tentang project. Kalau informasi kurang, nyatakan apa yang belum diketahui.
Jangan meminta password, token, API key, atau data sensitif.
Jika diminta sesuatu di luar konteks Media Kreatif, tetap bantu seperlunya tetapi jangan berpura-pura punya akses ke data yang tidak diberikan.`;

let model = null;
let chat = null;
let aiReady = false;
let aiInitPromise = null;

function $(id){ return document.getElementById(id); }

function addMessage(text, role="bot", extra=""){
  const box=$("ai-messages");
  if(!box) return null;
  const el=document.createElement("div");
  el.className=`ai-message ai-message-${role} ${extra}`.trim();
  el.textContent=text;
  box.appendChild(el);
  box.scrollTop=box.scrollHeight;
  return el;
}

function setError(message){
  const el=$("ai-error");
  if(!el) return;
  el.textContent=message || "";
  el.classList.toggle("hidden", !message);
}

async function initAI(){
  if(aiReady) return true;
  if(aiInitPromise) return aiInitPromise;

  aiInitPromise=(async()=>{
    try{
      const config=window.BK_FIREBASE_CONFIG;
      if(!config) throw new Error("Konfigurasi Firebase belum tersedia.");

      /*
       * Do NOT call getApp() here. app.js initializes Firebase through the
       * compat SDK, while Firebase AI Logic's browser SDK is modular.
       * A named modular app avoids mixing the two SDK instances.
       */
      // Use the default modular Firebase app for AI Logic + App Check.
      // The compat SDK in app.js is a separate SDK instance; the modular
      // Firebase app below is the one used by Firebase AI Logic.
      const aiApp=initializeApp(config);

      // App Check must belong to the SAME modular app used by Firebase AI.
      // initializeAppCheck can only be called once per app.
      let appCheck;
      try{
        appCheck=initializeAppCheck(aiApp,{
          provider:new ReCaptchaEnterpriseProvider(RECAPTCHA_ENTERPRISE_SITE_KEY),
          isTokenAutoRefreshEnabled:true
        });
      }catch(err){
        if(!/already initialized|already exists/i.test(String(err?.message||err))){
          throw err;
        }
      }

      // Force the browser to obtain an App Check token before creating the AI chat.
      // This makes an invalid key/domain registration fail here with a useful error,
      // instead of looking like a generic AI request failure later.
      if(appCheck){
        await getToken(appCheck, true);
      }

      const ai=getAI(aiApp,{backend:new GoogleAIBackend()});
      model=getGenerativeModel(ai,{
        model:AI_MODEL,
        systemInstruction:SYSTEM_INSTRUCTION,
        generationConfig:{temperature:0.65,maxOutputTokens:700}
      });
      chat=model.startChat();
      aiReady=true;
      setError("");
      return true;
    }catch(err){
      console.error("Batu Kunci AI init:",err);
      const msg=String(err?.message||err);
      window.__BK_AI_INIT_ERROR = msg;
      if(/app check|recaptcha|invalid/i.test(msg)){
        setError("App Check gagal: " + msg);
      }else{
        setError("AI belum siap: "+msg);
      }
      return false;
    }finally{
      aiInitPromise=null;
    }
  })();

  return aiInitPromise;
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
  if(!input) return;
  input.value=text;
  input.focus();
  input.dispatchEvent(new Event("input"));
};

window.sendBatuKunciAI=async function(event){
  event.preventDefault();
  const input=$("ai-input");
  const send=$("ai-send");
  const text=input?.value.trim();
  if(!text || !send || send.disabled) return;

  setError("");
  if(!aiReady){
    const ok=await initAI();
    if(!ok){
      setError("AI init gagal: " + (window.__BK_AI_INIT_ERROR || "error tidak diketahui"));
      return;
    }
  }

  input.value="";
  input.style.height="auto";
  addMessage(text,"user");
  const loading=addMessage("Sedang mikir...","bot","ai-message-loading");
  send.disabled=true;

  try{
    const result=await chat.sendMessage(text);
    const answer=result?.response?.text?.() || "Gemini tidak mengembalikan teks.";
    loading?.remove();
    addMessage(answer,"bot");
  }catch(err){
    console.error("Batu Kunci AI request:",err);
    loading?.remove();

    const msg=String(err?.message||"error tidak diketahui");
    if(/App Check token is invalid|invalid.*app check|app check/i.test(msg)){
      setError("APP CHECK ERROR: " + msg);
    }else{
      setError("AI REQUEST ERROR: " + msg);
    }
  }finally{
    send.disabled=false;
    input?.focus();
  }
};

const input=document.getElementById("ai-input");
if(input){
  input.addEventListener("input",()=>{
    input.style.height="auto";
    input.style.height=Math.min(input.scrollHeight,110)+"px";
  });
  input.addEventListener("keydown",e=>{
    if(e.key==="Enter" && !e.shiftKey){
      e.preventDefault();
      $("ai-send")?.click();
    }
  });
}

// Warm up AI only after page resources are loaded, but never send a Gemini request.
window.addEventListener("load",()=>{ initAI(); });
