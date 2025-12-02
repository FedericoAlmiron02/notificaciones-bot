require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const admin = require('firebase-admin');
const http = require('http'); // 1. Importar módulo HTTP

// --- A. SERVIDOR FALSO PARA RENDER (Keep-Alive) ---
// Render necesita que escuches en un puerto o matará el proceso.
const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.end('El Bot de Notificaciones esta vivo 🤖');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌍 Servidor web escuchando en puerto ${PORT}`);
});

// --- B. CONFIGURACIÓN FIREBASE (Desde Variable de Entorno) ---
// En Render, pegaremos el contenido del JSON en una variable llamada FIREBASE_CREDENTIALS
let serviceAccount;
try {
  if (process.env.FIREBASE_CREDENTIALS) {
    // Si estamos en la nube (Render)
    serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
  } else {
    // Si estamos en local y tenemos el archivo
    serviceAccount = require('./firebase-key.json');
  }
} catch (error) {
  console.error('❌ Error leyendo credenciales de Firebase:', error.message);
}

if (serviceAccount) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

// --- C. CONFIGURACIÓN SUPABASE ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

console.log("🤖 El Bot de Notificaciones (Multi-dispositivo) está escuchando...");

// --- D. LOGICA DEL LISTENER ---
const subscription = supabase
  .channel('escuchando-notificaciones')
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'pending_notifications'}, 
    async (payload) => {
      console.log('⚡ Nuevo evento detectado:', payload.new.user_id);
      await procesarNotificacion(payload.new);
    }
  )
  .subscribe();

// --- E. FUNCIÓN DE ENVÍO (Igual que antes) ---
async function procesarNotificacion(registro) {
  try {
    const { data: dispositivos, error } = await supabase
      .from('dispositivos')
      .select('fcm_token')
      .eq('usuario_id', registro.user_id);

    if (error || !dispositivos || dispositivos.length === 0) return;

    const tokens = dispositivos.map(d => d.fcm_token).filter(t => t);
    if (tokens.length === 0) return;

    const message = {
      notification: {
        title: 'Nuevo Mensaje',
        body: registro.mensaje || 'Nueva notificación', 
      },
      tokens: tokens,
    };

    await admin.messaging().sendEachForMulticast(message);
    console.log(`✅ Notificación enviada.`);
    
  } catch (err) {
    console.error('❌ Error enviando:', err);
  }
}