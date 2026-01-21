const fs = require('fs').promises;
const path = require('path');

// More storefronts to reach 500+
const moreStorefronts = [
    // More lifestyle influencers
    'sarahflint', 'caitlincovington', 'brightontheday', 'kellyinnyc',
    'kellylknight', 'morganstylized', 'livvyland', 'themilleraffect',
    'stylebyausten', 'elizahjames', 'acolorstory', 'styledbyfaith',
    'southernbelles', 'seersucker', 'prepobsessed', 'loverlygreyco',

    // More home influencers
    'studiomcgee', 'younghouselove', 'makinghomebase', 'designsponge',
    'apartmenttherapy', 'domainehome', 'myhouseteenylearnlove', 'remodelingallday',
    'thehousethatjillbuilt', 'sarahshermansamuel', 'amberinteriors', 'ginny.macdonald',
    'clairezinnecker', 'cottagefarm', 'southernfarmhouse', 'modernfarmhousefam',
    'thefarmhousechick', 'farmhousefixer', 'fixeruppershow', 'magnolia',
    'chippergaines', 'joannagaines', 'magnoliatable', 'silodistrict',

    // More fashion bloggers
    'blanknyc', 'showmeyourmumu', 'freepeople', 'anthropologie',
    'lulus', 'nordstrom', 'shopbop', 'revolve', 'asos',
    'showpo', 'princess.polly', 'shein', 'zaful', 'boohoo',
    'prettylittlething', 'missguided', 'nakedwardrobe', 'fashionnova',
    'summerbodieee', 'hotgirlsummer', 'summerstyle', 'beachbabe',

    // More tech influencers
    'techlinked', 'linus', 'unboxtherapy', 'mrwhosetheboss',
    'everythingapplepro', 'supraf', 'dave2d', 'shortcircuit',
    'hardwarecanucks', 'bitwit', 'jayztwocents', 'gamernexus',
    'techsource', 'randomfrankp', 'setup.wars', 'techflow',

    // More mom influencers
    'scarymerrymom', 'motherhoodinstyle', 'mamainstinct', 'momconfessional',
    'takingcarababies', 'drharveykarp', 'happiestbaby', 'babycenter',
    'whattoexpect', 'thebump', 'parents', 'romper',
    'mothermag', 'cupofjo', 'abeautifulmess', 'ohjoy',

    // More fitness influencers
    'emilyskyefit', 'mikiygalrani', 'tammy.hembrow', 'hopescope',
    'steph_fit_', 'gymshark', 'lululemon', 'outdoorvoices',
    'aloyoga', 'beachbody', 'p90x', 'insanity',
    'bodyboss', 'bbg', 'kaylaitsines', 'sweatapp',

    // More food influencers
    'tieghangerard', 'skinnytaste', 'seriouseats', 'thepioneerwoman',
    'barefoot.contessa', 'inagarten', 'chrissyteigen', 'cravingsbycteigen',
    'altonbrown', 'gordonramsay', 'jamieoliver', 'sallybakingaddiction',
    'preppy.kitchen', 'preppykitchen', 'joshuaweissman', 'babish',
    'smittenkitchen', 'cookieandkate', 'ohsheglows', 'minimalistbaker',

    // More beauty influencers
    'makeupbymario', 'violette_fr', 'lisaeldridge', 'samchapman',
    'pixiwoo', 'wayne_goss', 'gossmakeupartist', 'samandnic',
    'beautyblender', 'morphebrushes', 'colourpop', 'juviasplace',
    'fentybeauty', 'rihanna', 'kyliejenner', 'krisjenner',
    'kimkardashian', 'skims', 'goodamerican', 'poosh',

    // More pet influencers
    'jiffpom', 'marniethedog', 'tunameltsmyheart', 'mensweardog',
    'barkbox', 'barkshop', 'chewy', 'petco',
    'petsmart', 'bringfido', 'dogvacay', 'rover',

    // More cleaning/organization
    'mrshinchhome', 'mrshinchs', 'gocleanco', 'cleanwithmission',
    'cleaningarmy', 'professionalhomeorganizers', 'napodc', 'getorganized',
    'containerstore', 'thehomeedit.home', 'organizingwithsteph', 'sortedfood',

    // More DIY/Craft
    'lovemaegan', 'abeautifulmess', 'studiodiy', 'sugarandcloth',
    'ohcraft', 'damasklove', 'craftgossip', 'sewdiy',
    'sewingparts', 'moodfabrics', 'joanns', 'michaels',

    // More travel influencers
    'muradosmann', 'chelseakauai', 'doyoutravel', 'gypsea_lust',
    'leoniehanne', 'alexandralapp', 'fashionistable', 'nicolepham',
    'jayalvarrez', 'alexisren', 'gabifresh', 'tessholiday',

    // Random popular Amazon usernames
    'dailydeals', 'bestdeals', 'dealfinder', 'bargainhunter',
    'shopsmarter', 'savingsqueen', 'frugalliving', 'budgetfriendly',
    'affordablestyle', 'cheapfinds', 'amazonfinds', 'amazonfaves',
    'amazondiscoveries', 'amazonhaul', 'amazonreviews', 'amazonpicks'
];

async function addMoreStorefronts() {
    const csvPath = path.join(__dirname, '../../data/input/discovered-urls.csv');

    let content = await fs.readFile(csvPath, 'utf8');
    const existingUsernames = new Set();

    const lines = content.split('\n');
    for (const line of lines.slice(1)) {
        const parts = line.split(',');
        if (parts[0]) {
            existingUsernames.add(parts[0].toLowerCase());
        }
    }

    console.log(`Existing storefronts: ${existingUsernames.size}`);

    let addedCount = 0;
    const now = new Date().toISOString();

    for (const username of moreStorefronts) {
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

addMoreStorefronts()
    .then(() => console.log('Done!'))
    .catch(err => console.error('Error:', err));
