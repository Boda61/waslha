import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

// Helper to create a fresh client session
function createTestClient() {
  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });
}

async function runTests() {
  console.log('--- Starting Migration Tests ---');
  
  const client1 = createTestClient();
  const client2 = createTestClient();
  
  const email1 = 'player1_sql@gmail.com';
  const email2 = 'player2_sql@gmail.com';
  const password = 'testpassword123';
  
  try {
    // 1. Test Login
    console.log('1. Logging in users...');
    const { data: auth1, error: err1 } = await client1.auth.signInWithPassword({ email: email1, password });
    if (err1) throw err1;

    const { data: auth2, error: err2 } = await client2.auth.signInWithPassword({ email: email2, password });
    if (err2) throw err2;
    console.log('✅ Login successful.');

    // 2. Create Room
    console.log('2. Creating room...');
    const { data: roomData, error: roomErr } = await client1.rpc('create_room', { p_team: 'red' });
    if (roomErr) throw roomErr;
    const roomCode = roomData[0].code;
    const roomId = roomData[0].room_id;
    console.log(`✅ Room created. Code: ${roomCode}, ID: ${roomId}`);

    // 3. Join Room
    console.log('3. Joining room from player 2...');
    const { data: joinData, error: joinErr } = await client2.rpc('join_room', { p_code: roomCode });
    if (joinErr) throw joinErr;
    await client2.rpc('set_team', { p_room_id: roomId, p_team: 'blue' });
    console.log('✅ Player 2 joined successfully and set team.');

    // 4. Test Security (Phase 10)
    console.log('4. Testing Security (Unauthorized Access)...');
    const { data: secretData, error: secretErr } = await client1.from('challenge_secrets').select('*');
    if (secretErr) {
      console.log('✅ Security: challenge_secrets is blocked (Expected error)');
    } else if (secretData && secretData.length > 0) {
      throw new Error('Security vulnerability: challenge_secrets is readable!');
    } else {
      console.log('✅ Security: challenge_secrets returned empty (RLS works).');
    }

    // 5. Test Realtime
    console.log('5. Testing Realtime...');
    let realtimeReceived = false;
    const channel = client2.channel(`room:${roomId}`);
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` }, (payload) => {
      if (payload.new.is_ready) realtimeReceived = true;
    }).subscribe();

    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('Setting Player 1 ready...');
    await client1.rpc('set_ready', { p_room_id: roomId, p_ready: true });
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    if (realtimeReceived) {
      console.log('✅ Realtime synchronization successful.');
    } else {
      console.error('❌ Realtime synchronization failed. Did not receive update.');
    }
    client2.removeChannel(channel);

    console.log('--- All Tests Completed Successfully ---');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

runTests();
