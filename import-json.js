const fs = require('fs');
const path = require('path');
const axios = require('axios');

// -------------------------------------------------------------
// CONFIGURATION
// -------------------------------------------------------------
const JSON_FILES = [
  'mrDoiqQB - ios-77.json',
  'JwpEh8zA - android.json',
  'PUwqfWUn - android-77.json',
  'cI6y0EqF - ios.json'
];

const RENDER_APP_URL = 'https://bug-tracker-0a55.onrender.com';

const USER_EMAIL = 'jayjayqa01@gmail.com';
const USER_PASSWORD = 'btpass123';

const STATUS_MAP = {
  'On Filing': 'On Filing',
  'Filed Ticket List': 'Filed Ticket List',
  'Filed Ticket List for Host': 'Filed Ticket List for Host',
  'Working in Progress by Dev': 'Working in Progress by Dev',
  'Complete (For Retest)': 'Complete (For Retest)',
  'Reactive': 'Reactive',
  'Backend Issue': 'Backend Issue',
  'Closed': 'Closed'
};

// Map file name to exact backend allowed platforms: 'Android', 'iOS', or 'Web'
function getStrictPlatform(fileName) {
  const lower = fileName.toLowerCase();

  // Handle 77 Live specific files
  if (lower.includes('ios-77') || lower.includes('77-ios')) return '77 Live iOS';
  if (lower.includes('android-77') || lower.includes('77-android')) return '77 Live Android';

  // Standard platform fallbacks
  if (lower.includes('ios')) return '77 Live iOS';
  if (lower.includes('android')) return 'Android';
  if (lower.includes('web')) return 'Web';

  return 'iOS';
}

// Map Trello Labels to Severity / Priority values
function parseCardLabels(labels = []) {
  let priority = 'Medium';
  let severity = 'Medium';

  labels.forEach(l => {
    const name = (l.name || '').toLowerCase();
    if (name.includes('critical') || name.includes('blocker')) {
      severity = 'Critical';
      priority = 'Critical';
    } else if (name.includes('high') || name.includes('p1')) {
      severity = 'High';
      priority = 'High';
    } else if (name.includes('low') || name.includes('p3')) {
      severity = 'Low';
      priority = 'Low';
    }
  });

  return { priority, severity };
}

// Filter out empty template or placeholder cards from Trello
function isTemplateCard(cardName = '') {
  const lower = cardName.toLowerCase();
  return (
    lower.includes('[date] title') ||
    lower.includes('template') ||
    lower.trim() === '' ||
    /^0000_/.test(lower)
  );
}

// -------------------------------------------------------------
// PRE-CLEANUP FUNCTION
// Deletes previously imported & template tickets before import
// -------------------------------------------------------------
// async function clearImportedTickets(authHeaders) {
//   console.log('🧹 Cleaning up old imported tickets & template entries...');
//   try {
//     const res = await axios.get(`${RENDER_APP_URL}/api/tickets`, { headers: authHeaders });
//     const tickets = res.data || [];

//     // Identify tickets that came from Trello imports or match template titles
//     const toDelete = tickets.filter(t => 
//       (t.description && t.description.includes('Imported from')) ||
//       isTemplateCard(t.title)
//     );

//     console.log(`Found ${toDelete.length} old/template tickets to remove.\n`);

//     for (const ticket of toDelete) {
//       try {
//         await axios.delete(`${RENDER_APP_URL}/api/tickets/${ticket.id}`, { headers: authHeaders });
//         console.log(` 🗑 Deleted: "${ticket.title}" (ID: ${ticket.id})`);
//       } catch (delErr) {
//         console.warn(` ⚠ Failed to delete ticket ID ${ticket.id}:`, delErr.message);
//       }
//     }
//     console.log('\n✅ Pre-cleanup completed successfully!\n');
//   } catch (err) {
//     console.warn('⚠ Pre-cleanup error:', err.message);
//   }
// }

// -------------------------------------------------------------
// MIGRATION SCRIPT
// -------------------------------------------------------------
async function importAllBoards() {
  try {
    console.log(`Connecting to ${RENDER_APP_URL}...`);

    const loginRes = await axios.post(`${RENDER_APP_URL}/api/auth/login`, {
      email: USER_EMAIL,
      password: USER_PASSWORD
    });
    const authHeaders = { Authorization: `Bearer ${loginRes.data.token}` };
    console.log('Authentication successful!\n');

    // 1. Automatically wipe old imported/template data
    await clearImportedTickets(authHeaders);

    // 2. Loop through and import fresh data
    for (const fileName of JSON_FILES) {
      const filePath = path.join(__dirname, fileName);

      if (!fs.existsSync(filePath)) {
        console.warn(`⚠ File not found: ${fileName}`);
        continue;
      }

      const platform = getStrictPlatform(fileName);

      console.log(`========================================`);
      console.log(`Processing: ${fileName} [Normalized Platform: "${platform}"]`);
      console.log(`========================================`);

      const rawData = fs.readFileSync(filePath, 'utf8');
      const boardData = JSON.parse(rawData);

      const listsMap = {};
      if (boardData.lists) {
        boardData.lists.forEach(l => {
          listsMap[l.id] = l.name.trim();
        });
      }

      const cards = boardData.cards || [];
      console.log(`Found ${cards.length} cards.\n`);

      for (const card of cards) {
        // Skip archived/closed cards
        if (card.closed) continue;

        // Skip incomplete template cards
        if (isTemplateCard(card.name)) {
          console.log(` ⏩ Skipped template/incomplete card: "${card.name}"`);
          continue;
        }

        const listName = listsMap[card.idList] || 'On Filing';
        const status = STATUS_MAP[listName] || 'On Filing';
        const { priority, severity } = parseCardLabels(card.labels);

        console.log(`Importing: "${card.name}" [Status: "${status}", Platform: "${platform}", Severity: "${severity}"]`);

        const ticketRes = await axios.post(
          `${RENDER_APP_URL}/api/tickets`,
          {
            title: card.name,
            description: card.desc || `Imported from ${boardData.name || fileName}`,
            status: status,
            priority: priority,
            severity: severity,
            platform: platform
          },
          { headers: authHeaders }
        );

        const ticketId = ticketRes.data.id;

        // Attachments migration
        const attachments = card.attachments || [];
        for (const att of attachments) {
          try {
            await axios.post(
              `${RENDER_APP_URL}/api/tickets/${ticketId}/attachments/link`,
              {
                url: att.url,
                name: att.name || 'Trello Attachment'
              },
              { headers: authHeaders }
            );
            console.log(`   └─ Attached link: ${att.name}`);
          } catch (attErr) {
            console.warn(`   └─ Failed to attach link ${att.name}:`, attErr.message);
          }
        }
      }
      console.log(`\nSuccessfully imported ${fileName}\n`);
    }

    console.log('All Trello boards have been migrated successfully!');
  } catch (err) {
    if (err.response) {
      console.error('Migration failed:', err.response.status, err.response.data);
    } else {
      console.error('Migration error:', err.message);
    }
  }
}

importAllBoards();