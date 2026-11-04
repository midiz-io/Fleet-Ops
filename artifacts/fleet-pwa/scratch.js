import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mxqxmtvbahgsfrzwshdl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14cXhtdHZiYWhnc2ZyendzaGRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0MzYyMzksImV4cCI6MjA5MzAxMjIzOX0.khGshy_3IaNbtAWTYjk4Zi9xWfHNcMFkpC1iHI-YhaM';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase.from('drivers').select('*');
  console.log("Drivers table:", data);
  if (error) console.error("Error:", error);
}

main();
