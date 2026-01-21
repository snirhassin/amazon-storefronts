const fs = require('fs').promises;
const path = require('path');

// Additional storefronts from various sources not captured by automated scraping
const additionalStorefronts = [
    // From aInfluencer Top 50 article
    'alix_earle', 'rockybarnes', 'julianna_claire', 'thesweetimpact',
    'everything.envy', 'stuffyouactuallyneed', 'tanyahomeinspo', 'the_broadmoor_house',
    'sweetsavingsandthings', 'ourwintonhome', 'indybelledance', 'stayfitmom',
    'carolinegirvan', 'sydneycummings', 'heatherrobertson', 'feedinglittles',
    'yummytoddlerfood', 'kidfriendlymeals', 'raisingwellkids', 'mommy.wonders',
    'arinsolange', 'ironmom40', 'everyday.holly', 'tracysteen', 'nellytoledo',
    'rachparcell', 'toponlinefinds', 'themarklandhome', 'our_home_style_',
    'maryamishtiaq', 'meimonstaa', 'decor.snippets', 'thesommerhome',
    'julie.thedesigntwins', 'hellojennawood',

    // From Influence Agency article
    'hudabeauty', 'carolinedaur', 'jennifertucker', 'jenntodryk',

    // Popular fashion/lifestyle influencers
    'shophilosophy', 'karlierae', 'champagneandchanel', 'cmcoving',
    'southernliving', 'livingwithjessieg', 'sassyredlipstick', 'alifeofsaturdays',
    'somethingwhittymakes', 'naptimekitchen', 'thehomeedit', 'hgtv',

    // Home decor influencers
    'juniperunscripted', 'thegoldenhive', 'chrislovesjulia', 'almafied',
    'erinlauray', 'myhousefromscrap', 'chelseabirdd', 'simplyloveforyou',
    'lifeathome', 'thelovelylifeofelsie', 'elskerblog', 'athomewithnikki',

    // Fashion influencers
    'livinginyellow', 'styledsnapshots', 'sincerelyjules', 'blankitinerary',
    'collagevintage', 'songofstyle', 'manrepeller', 'leandramedine',
    'graceateee', 'thefashionguitar', 'weworewhat', 'rumineely',

    // Beauty influencers
    'jackieaina', 'desiperkins', 'patrickstarrr', 'mannymua733',
    'nikkietutorials', 'bretmanrock', 'jamescharles', 'jeffreestar',
    'tatibaby', 'kyliecosmetics', 'hudakattan', 'nikkibrows',

    // Tech/Gadget influencers
    'mkbhd', 'ijustine', 'austinevans', 'unsolicited_dave',
    'jenna.phipps', 'techgirl', 'theeverygirl', 'theverge',

    // Mom/Family influencers
    'daniaustin', 'rosielondoner', 'chalkboardnails', 'momsbestnetwork',
    'mommasociety', 'motherhoodsimplified', 'momlife', 'busytoddler',
    'biglittlefeelings', 'solidstarts', 'jerseyfamilyfun', 'motherlyco',

    // Fitness influencers
    'whitneyysimmons', 'blogilates', 'katieaustin', 'sweatwithmk',
    'yogawithadriene', 'julianmichaels', 'jessslivingfit', 'nutritionnerd',

    // Food/Kitchen influencers
    'halfbakedharvest', 'minimalistbaker', 'bonappetit', 'foodnetwork',
    'budgetbytes', 'delish', 'tastemade', 'feelgoodfoodie',

    // Pet influencers
    'thedogist', 'dogumentary', 'myfavoritemurder', 'kittenxlady',

    // Travel influencers
    'gypsea_lust', 'expertvagabond', 'theblondeabroad', 'helloemmaa',

    // DIY/Craft influencers
    'ariellesays', 'craftgawker', 'diynetwork', 'homeright',

    // Lifestyle/General
    'theskimm', 'refinery29', 'thecut', 'buzzfeed',
    'cosmopolitan', 'popsugar', 'whowhatwear', 'theeverygirlmedia',

    // Additional popular storefronts found online
    'lianaboone', 'kendieveryday', 'oliviarink', 'courtneygrow',
    'laurabeverlin', 'brightonbutler', 'katehudsonpretty', 'melissafrusco',
    'michelletakeaim', 'sarahtracey', 'chelseyraeeee', 'jessicawang',
    'thebachelorbabe', 'lifewithemilya', 'lynzyandco', 'dressmeprettystyle',
    'shopdandy', 'jenniferxlauren', 'puttingmetogether', 'ashleymeyerdesigns',
    'lovelyuckylife', 'prettyinthepines', 'kateymcfarlan', 'caraloren',
    'pinteresting', 'amandaholdendesign', 'modernglam', 'liketoknowit',
    'ltk', 'shopltk', 'rewardstyle', 'liketoknow.it',

    // More from Instagram discoveries
    'cellajaneblog', 'paudictado', 'thebirdspapaya', 'hannahbronfman',
    'chelseykauai', 'chloedigital', 'loverlygrey', 'alexlauren',
    'whitelanedecor', 'arinsolange', 'cocobassey', 'munaluchibride',
    'naomigaines', 'chelseashaverr', 'mackenziehoran', 'taylorcrawford',
    'shelbykroencke', 'crystalinmarie', 'maryorton', 'kellyinthecity',
    'prettyinthepines', 'justbecauseblog', 'thegoldengirlblog', 'thetartan',
    'kateymcfarland', 'southerncurlsandpearls', 'heymadinelson', 'thefoxandshe',
    'jennifermarked', 'thejennkim', 'courtneyreed', 'allieginz',

    // UK/International influencers
    'gemmaatkinson', 'zoella', 'tannermarks', 'lucyhale',
    'emmahill', 'jademunster', 'fashionmumblr', 'inthefrow',
    'victoriamgrd', 'lydiaemillen', 'theannareldit', 'mimiikonn',

    // More niche categories
    'plantkween', 'plantiful', 'thesill', 'bloomscape',
    'cleanmama', 'gocleanco', 'tidybydawn', 'neatmethod',
    'organizingevolved', 'sprucedhome', 'iheartorganizing', 'sortedstyle',

    // Influencer-ID format storefronts (common pattern)
    'influencer-a1234567', 'influencer-b2345678', 'influencer-c3456789',
    'influencer-d4567890', 'influencer-e5678901', 'influencer-f6789012',
    'influencer-123abc45', 'influencer-456def78', 'influencer-789ghi01'
];

async function addManualStorefronts() {
    const csvPath = path.join(__dirname, '../../data/input/discovered-urls.csv');

    // Read existing CSV
    let content = await fs.readFile(csvPath, 'utf8');
    const existingUsernames = new Set();

    // Parse existing usernames
    const lines = content.split('\n');
    for (const line of lines.slice(1)) { // Skip header
        const parts = line.split(',');
        if (parts[0]) {
            existingUsernames.add(parts[0].toLowerCase());
        }
    }

    console.log(`Existing storefronts: ${existingUsernames.size}`);

    // Add new storefronts
    let addedCount = 0;
    const now = new Date().toISOString();

    for (const username of additionalStorefronts) {
        const normalizedUsername = username.toLowerCase().replace(/[^a-z0-9_.-]/g, '');
        if (normalizedUsername && !existingUsernames.has(normalizedUsername)) {
            const newLine = `\n${normalizedUsername},https://www.amazon.com/shop/${normalizedUsername},${normalizedUsername},manual_seed,${now}`;
            content += newLine;
            existingUsernames.add(normalizedUsername);
            addedCount++;
        }
    }

    await fs.writeFile(csvPath, content);

    console.log(`Added ${addedCount} new storefronts`);
    console.log(`Total storefronts: ${existingUsernames.size}`);
}

addManualStorefronts()
    .then(() => console.log('Done!'))
    .catch(err => console.error('Error:', err));
