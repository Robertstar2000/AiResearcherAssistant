const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function testAuthentication() {
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_KEY
  );

  const testEmail = 'Test.User@Example.com';
  const testPassword = 'testPassword123!';
  const testName = 'Test User';

  console.log('1. Testing signup with mixed-case email:', testEmail);
  
  // First, clean up any existing test user
  const { data: deleteData, error: deleteError } = await supabase
    .from('AiResearcherAssistant')
    .delete()
    .ilike('e_mail', testEmail);

  if (deleteError) {
    console.error('Error cleaning up:', deleteError);
  }

  // Test signup
  const { data: signupData, error: signupError } = await supabase
    .from('AiResearcherAssistant')
    .insert({
      e_mail: testEmail.toLowerCase().trim(),
      "User-Name": testName,
      PassWord: testPassword.trim(),
      Occupation: 'Tester',
      Location: 'Test Location',
      title: '',
      content: '',
      references: ''
    })
    .select()
    .single();

  if (signupError) {
    console.error('Signup error:', signupError);
    return;
  }
  console.log('Signup successful');

  // Test login with lowercase email
  const lowercaseEmail = testEmail.toLowerCase();
  console.log('2. Testing login with lowercase email:', lowercaseEmail);

  const { data: loginData, error: loginError } = await supabase
    .from('AiResearcherAssistant')
    .select('*')
    .ilike('e_mail', lowercaseEmail)
    .eq('PassWord', testPassword.trim())
    .single();

  if (loginError) {
    console.error('Login error:', loginError);
    return;
  }
  console.log('Login successful');
  console.log('User data:', loginData);

  // Clean up
  console.log('3. Cleaning up test data...');
  await supabase
    .from('AiResearcherAssistant')
    .delete()
    .ilike('e_mail', testEmail);
  
  console.log('Test completed successfully!');
}

testAuthentication().catch(console.error);
