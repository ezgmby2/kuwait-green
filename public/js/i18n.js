// English / Arabic strings. Static markup uses data-i18n="key"; scripts call t('key', {vars}).
const STRINGS = {
  en: {
    skip: 'Skip to content',
    appName: 'Kuwait Green',
    tagline: "Let's turn Kuwait green, one plant at a time",
    ofKuwaitGreen: "of Kuwait's areas are green",
    plants: 'Plants', growers: 'Growers', thisWeek: 'This week',
    legendNone: 'No plants',
    mapHint: 'Tap an area to see its plants. Pinch or scroll to zoom.',
    greenestAreas: '🌳 Greenest areas', topGrowers: '🏆 Top growers',
    recentPlants: 'Recently planted', loadMore: 'Load more', allAreas: 'All areas',
    logPlant: 'Log a plant', signInToLog: 'Sign in to log your plants and turn your area green.',
    stepPhoto: 'Take a photo', tapToPhoto: 'Tap to take or choose a photo',
    stepWhat: 'What did you plant?', nickname: 'Nickname (optional)', nicknamePh: 'e.g. Little Sidr',
    note: 'Note (optional)', notePh: 'Where, why, any story…',
    stepWhere: 'Where is it?', useMyLocation: 'Use my location', chooseArea: 'Or choose your area…',
    tapMapToPin: 'Or tap the map to drop a pin.',
    plantIt: 'Plant it!',
    privacyNote: '🔒 Your exact location stays private. Others only see the area name. Photo metadata (like GPS) is removed.',
    whyGreen: 'Why plant in Kuwait?',
    fact1: 'Kuwait regularly reaches 50°C in summer. Trees can cool streets by several degrees through shade and evaporation.',
    fact2: 'Plants hold sandy soil in place and act as windbreaks, reducing dust storms.',
    fact3: 'Every tree absorbs CO₂ and filters dust from the air we breathe.',
    fact4: 'Native desert plants like Sidr, Ghaf and Arfaj need very little water once established.',
    tipsTitle: 'Smart watering tips',
    tip1: 'Water early in the morning or after sunset to avoid evaporation.',
    tip2: 'Water deeply but less often — it trains roots to grow down.',
    tip3: 'Cover soil with mulch or gravel to keep it cool and moist.',
    tip4: 'Autumn (Oct–Nov) and late winter (Feb–Mar) are the best planting seasons.',
    tip5: 'Reuse water from washing vegetables or your AC condensate.',
    plantGuide: 'Plants that love Kuwait',
    native: 'Native', heatLove: 'Loves heat', heatOk: 'Heat tolerant', heatShade: 'Needs some shade',
    signIn: 'Sign in', createAccount: 'Create account', username: 'Username', displayName: 'Display name',
    password: 'Password', pwHelp: 'At least 8 characters.', signOut: 'Sign out',
    myPlants: 'My plants', areasGreened: 'Areas greened', myGarden: 'My garden',
    tabMap: 'Map', tabFeed: 'Feed', tabLog: 'Plant', tabLearn: 'Learn', tabMe: 'Me',
    plantHere: 'Plant in this area', seeMap: 'See the map',
    zonePlants: '{n} plants growing here', zoneOnePlant: '1 plant growing here', zoneNoPlants: 'Still brown — be the first to plant here!',
    noPlantsYet: 'No plants here yet', beFirst: 'Be the first to plant one!',
    noMyPlants: "You haven't logged a plant yet", startGarden: 'Tap ＋ to log your first plant.',
    by: 'by {name}', in: 'in {zone}', remove: 'Remove', report: 'Report',
    confirmRemove: 'Remove this plant from the map?', confirmReport: 'Report this post as inappropriate or fake?',
    reported: 'Thanks — our community will review it.', removed: 'Plant removed',
    needPhoto: 'Please add a photo of your plant.', needSpecies: 'Please choose what you planted.', needLocation: 'Please set where your plant is.',
    locating: 'Finding your location…', locFound: '📍 {zone}, {gov}', locOutside: 'That spot is outside Kuwait\'s mapped land areas.',
    gpsDenied: 'Location permission denied. Choose your area or tap the map.', gpsUnavailable: 'Couldn\'t get your location. Choose your area or tap the map.',
    planting: 'Planting…', offline: 'You seem to be offline. Please try again.',
    greenedTitle: 'You turned {zone} green! 🎉', greenedText: 'You planted the very first plant in {zone}. The map just changed because of you.',
    plantedTitle: 'Planted! 🌱', plantedText: '{zone} now has {n} plants. Every one makes Kuwait greener.',
    levelUpTitle: '{zone} got greener! 🌳', levelUpText: 'Your plant pushed {zone} to a deeper shade of green.',
    welcome: 'Welcome, {name}! 🌱', signedOut: 'Signed out',
    badge0: 'Seedling', badge1: 'Sprout', badge2: 'Gardener', badge3: 'Tree Hugger', badge4: 'Oasis Maker',
    justNow: 'just now', minAgo: '{n}m ago', hrAgo: '{n}h ago', dayAgo: '{n}d ago',
    photoTooBig: 'Could not read that photo. Try another one.',
    plantsCount: '{n} plants',
    demoBanner: '🧪 Live demo — everything you add is saved in this browser only.',
    tryGuest: 'Try it as a guest',
  },
  ar: {
    skip: 'انتقل إلى المحتوى',
    appName: 'الكويت خضراء',
    tagline: 'لنجعل الكويت خضراء، نبتة تلو الأخرى',
    ofKuwaitGreen: 'من مناطق الكويت أصبحت خضراء',
    plants: 'نباتات', growers: 'مزارعون', thisWeek: 'هذا الأسبوع',
    legendNone: 'بلا نباتات',
    mapHint: 'اضغط على منطقة لرؤية نباتاتها. استخدم إصبعين أو العجلة للتكبير.',
    greenestAreas: '🌳 أكثر المناطق خضرة', topGrowers: '🏆 أفضل المزارعين',
    recentPlants: 'زُرعت مؤخرًا', loadMore: 'عرض المزيد', allAreas: 'كل المناطق',
    logPlant: 'سجّل نبتة', signInToLog: 'سجّل الدخول لتسجيل نباتاتك وتحويل منطقتك إلى الأخضر.',
    stepPhoto: 'التقط صورة', tapToPhoto: 'اضغط لالتقاط أو اختيار صورة',
    stepWhat: 'ماذا زرعت؟', nickname: 'اسم مميز (اختياري)', nicknamePh: 'مثال: سدرتي الصغيرة',
    note: 'ملاحظة (اختياري)', notePh: 'أين، ولماذا، أو أي قصة…',
    stepWhere: 'أين هي؟', useMyLocation: 'استخدم موقعي', chooseArea: 'أو اختر منطقتك…',
    tapMapToPin: 'أو اضغط على الخريطة لتحديد الموقع.',
    plantIt: 'ازرعها!',
    privacyNote: '🔒 موقعك الدقيق يبقى خاصًا. يرى الآخرون اسم المنطقة فقط. نحذف بيانات الصورة (مثل GPS).',
    whyGreen: 'لماذا نزرع في الكويت؟',
    fact1: 'تصل الحرارة في الكويت إلى ٥٠ درجة صيفًا. الأشجار تبرّد الشوارع بعدة درجات بالظل والتبخر.',
    fact2: 'النباتات تثبّت التربة الرملية وتعمل كمصدات للرياح، فتقلل العواصف الترابية.',
    fact3: 'كل شجرة تمتص ثاني أكسيد الكربون وتنقّي الهواء من الغبار.',
    fact4: 'النباتات الصحراوية المحلية مثل السدر والغاف والعرفج تحتاج القليل من الماء بعد أن تثبت.',
    tipsTitle: 'نصائح ذكية للري',
    tip1: 'اسقِ في الصباح الباكر أو بعد الغروب لتقليل التبخر.',
    tip2: 'اسقِ بعمق وعلى فترات متباعدة — ليتعمق الجذر.',
    tip3: 'غطِّ التربة بالنشارة أو الحصى لتبقى باردة ورطبة.',
    tip4: 'الخريف (أكتوبر–نوفمبر) وأواخر الشتاء (فبراير–مارس) أفضل مواسم الزراعة.',
    tip5: 'أعد استخدام ماء غسل الخضار أو ماء المكيّف.',
    plantGuide: 'نباتات تحب الكويت',
    native: 'محلي', heatLove: 'تحب الحرارة', heatOk: 'تتحمل الحرارة', heatShade: 'تحتاج بعض الظل',
    signIn: 'تسجيل الدخول', createAccount: 'حساب جديد', username: 'اسم المستخدم', displayName: 'الاسم الظاهر',
    password: 'كلمة المرور', pwHelp: '٨ أحرف على الأقل.', signOut: 'تسجيل الخروج',
    myPlants: 'نباتاتي', areasGreened: 'مناطق خضّرتها', myGarden: 'حديقتي',
    tabMap: 'الخريطة', tabFeed: 'الجديد', tabLog: 'ازرع', tabLearn: 'تعلّم', tabMe: 'حسابي',
    plantHere: 'ازرع في هذه المنطقة', seeMap: 'شاهد الخريطة',
    zonePlants: '{n} نبتة تنمو هنا', zoneOnePlant: 'نبتة واحدة تنمو هنا', zoneNoPlants: 'ما زالت بنية — كن أول من يزرع هنا!',
    noPlantsYet: 'لا توجد نباتات هنا بعد', beFirst: 'كن أول من يزرع!',
    noMyPlants: 'لم تسجّل أي نبتة بعد', startGarden: 'اضغط ＋ لتسجيل أول نبتة.',
    by: 'بواسطة {name}', in: 'في {zone}', remove: 'حذف', report: 'إبلاغ',
    confirmRemove: 'حذف هذه النبتة من الخريطة؟', confirmReport: 'الإبلاغ عن هذا المنشور كغير لائق أو مزيف؟',
    reported: 'شكرًا — سيتم مراجعته.', removed: 'تم حذف النبتة',
    needPhoto: 'أضف صورة لنبتتك من فضلك.', needSpecies: 'اختر نوع النبتة من فضلك.', needLocation: 'حدد مكان نبتتك من فضلك.',
    locating: 'جارٍ تحديد موقعك…', locFound: '📍 {zone}، {gov}', locOutside: 'هذا المكان خارج مناطق الكويت المحددة.',
    gpsDenied: 'تم رفض إذن الموقع. اختر منطقتك أو اضغط على الخريطة.', gpsUnavailable: 'تعذّر تحديد موقعك. اختر منطقتك أو اضغط على الخريطة.',
    planting: 'جارٍ الزراعة…', offline: 'يبدو أنك غير متصل. حاول مرة أخرى.',
    greenedTitle: 'حوّلت {zone} إلى الأخضر! 🎉', greenedText: 'زرعت أول نبتة في {zone}. الخريطة تغيّرت بفضلك.',
    plantedTitle: 'تمت الزراعة! 🌱', plantedText: 'أصبح في {zone} الآن {n} نبتة. كل واحدة تجعل الكويت أكثر خضرة.',
    levelUpTitle: '{zone} أصبحت أكثر خضرة! 🌳', levelUpText: 'نبتتك جعلت {zone} بلون أخضر أغمق.',
    welcome: 'أهلاً {name}! 🌱', signedOut: 'تم تسجيل الخروج',
    badge0: 'بذرة', badge1: 'برعم', badge2: 'مزارع', badge3: 'محب الأشجار', badge4: 'صانع الواحات',
    justNow: 'الآن', minAgo: 'قبل {n} د', hrAgo: 'قبل {n} س', dayAgo: 'قبل {n} يوم',
    photoTooBig: 'تعذّرت قراءة الصورة. جرّب صورة أخرى.',
    plantsCount: '{n} نبتة',
    demoBanner: '🧪 نسخة تجريبية — كل ما تضيفه يُحفظ في هذا المتصفح فقط.',
    tryGuest: 'جرّب كضيف',
  },
};

let lang = (navigator.language || '').startsWith('ar') ? 'ar' : 'en';
try { lang = localStorage.getItem('kg_lang') || lang; } catch { /* storage blocked */ }
if (!STRINGS[lang]) lang = 'en';

export const getLang = () => lang;

export function t(key, vars = {}) {
  const s = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}

export function applyI18n(root = document) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  document.title = t('appName');
}

export function setLang(next) {
  lang = STRINGS[next] ? next : 'en';
  try { localStorage.setItem('kg_lang', lang); } catch { /* ignore */ }
  applyI18n();
}
