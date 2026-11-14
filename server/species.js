// Plants suited to Kuwait's hot, arid climate, with short care tips shown in the app.
// water: how often to water in summer; heat: 1-3 tolerance; native: native to the Arabian Peninsula.
export const SPECIES = [
  { id: 'date-palm', name: 'Date Palm', nameAr: 'نخلة', emoji: '🌴', type: 'Tree', native: true, heat: 3, water: 'Deep watering weekly; twice weekly in summer', tip: 'The heart of Kuwaiti heritage. Plant in full sun and water deeply so roots grow down, not out.' },
  { id: 'sidr', name: 'Sidr (Christ\'s Thorn)', nameAr: 'سدر', emoji: '🌳', type: 'Tree', native: true, heat: 3, water: 'Every 7–10 days once established', tip: 'A tough native shade tree. Its fruit (kunar) and leaves are loved across the Gulf.' },
  { id: 'ghaf', name: 'Ghaf Tree', nameAr: 'غاف', emoji: '🌳', type: 'Tree', native: true, heat: 3, water: 'Weekly for the first year, then rarely', tip: 'Deep roots reach groundwater — one of the best desert trees for shade and soil.' },
  { id: 'arfaj', name: 'Arfaj', nameAr: 'عرفج', emoji: '🌼', type: 'Shrub', native: true, heat: 3, water: 'Rarely — natural rainfall is often enough', tip: 'Kuwait\'s national flower. Its yellow blooms appear after winter rains; perfect for desert gardens.' },
  { id: 'acacia', name: 'Acacia (Samr / Talh)', nameAr: 'سمر', emoji: '🌳', type: 'Tree', native: true, heat: 3, water: 'Every 10–14 days once established', tip: 'Fixes nitrogen and improves poor sandy soil. Great for windbreaks.' },
  { id: 'tamarix', name: 'Tamarix (Athel)', nameAr: 'أثل', emoji: '🌲', type: 'Tree', native: true, heat: 3, water: 'Weekly; tolerates salty water', tip: 'Handles salty soil and brackish water — ideal for coastal areas.' },
  { id: 'neem', name: 'Neem', nameAr: 'نيم', emoji: '🌳', type: 'Tree', native: false, heat: 3, water: 'Weekly in summer', tip: 'Fast-growing, evergreen shade tree that keeps pests away naturally.' },
  { id: 'moringa', name: 'Moringa', nameAr: 'مورينجا', emoji: '🌿', type: 'Tree', native: false, heat: 3, water: 'Twice weekly in summer', tip: 'Grows fast in heat; its leaves are edible and packed with nutrients.' },
  { id: 'bougainvillea', name: 'Bougainvillea', nameAr: 'جهنمية', emoji: '🌺', type: 'Climber', native: false, heat: 3, water: 'Once or twice weekly — let soil dry between', tip: 'Loves heat and sun. Too much water means fewer flowers.' },
  { id: 'oleander', name: 'Oleander', nameAr: 'دفلة', emoji: '🌸', type: 'Shrub', native: false, heat: 3, water: 'Weekly', tip: 'Hardy flowering hedge. Note: all parts are toxic — keep away from kids and pets.' },
  { id: 'adenium', name: 'Desert Rose (Adenium)', nameAr: 'وردة الصحراء', emoji: '🌹', type: 'Succulent', native: true, heat: 3, water: 'Every 7–10 days; less in winter', tip: 'Thick trunk stores water. Great on balconies in full sun.' },
  { id: 'aloe', name: 'Aloe Vera', nameAr: 'ألوفيرا', emoji: '🪴', type: 'Succulent', native: true, heat: 3, water: 'Every 2 weeks', tip: 'Almost impossible to kill. Its gel soothes sunburn — handy in Kuwait summers!' },
  { id: 'cactus', name: 'Cactus & Succulents', nameAr: 'صبار', emoji: '🌵', type: 'Succulent', native: false, heat: 3, water: 'Every 2–3 weeks', tip: 'Perfect for beginners and small spaces. Use sandy, well-draining soil.' },
  { id: 'jasmine', name: 'Arabian Jasmine (Full)', nameAr: 'فل', emoji: '🤍', type: 'Shrub', native: false, heat: 2, water: '2–3 times weekly in summer', tip: 'Fragrant white flowers. Give it afternoon shade in peak summer.' },
  { id: 'lantana', name: 'Lantana', nameAr: 'لانتانا', emoji: '🌼', type: 'Shrub', native: false, heat: 3, water: 'Weekly', tip: 'Colourful blooms that attract butterflies and bees.' },
  { id: 'pomegranate', name: 'Pomegranate', nameAr: 'رمان', emoji: '🍎', type: 'Fruit tree', native: false, heat: 3, water: 'Twice weekly in summer', tip: 'Thrives in heat and gives fruit within 2–3 years.' },
  { id: 'fig', name: 'Fig', nameAr: 'تين', emoji: '🍈', type: 'Fruit tree', native: false, heat: 2, water: 'Twice weekly in summer', tip: 'Mulch well to keep roots cool. Fruits twice a year.' },
  { id: 'lemon', name: 'Lemon / Lime', nameAr: 'ليمون', emoji: '🍋', type: 'Fruit tree', native: false, heat: 2, water: '2–3 times weekly in summer', tip: 'Grows well in large pots. Protect from hot winds in summer.' },
  { id: 'mint', name: 'Mint', nameAr: 'نعناع', emoji: '🌱', type: 'Herb', native: false, heat: 1, water: 'Daily in summer; keep soil moist', tip: 'Grow in a pot with partial shade — perfect for your chai!' },
  { id: 'basil', name: 'Basil', nameAr: 'ريحان', emoji: '🌿', type: 'Herb', native: false, heat: 2, water: 'Every 1–2 days in summer', tip: 'Pinch off flowers to keep leaves coming.' },
  { id: 'rosemary', name: 'Rosemary', nameAr: 'إكليل الجبل', emoji: '🌿', type: 'Herb', native: false, heat: 2, water: 'Weekly; let soil dry out', tip: 'Drought tolerant and fragrant. Best planted in autumn.' },
  { id: 'tomato', name: 'Tomato', nameAr: 'طماطم', emoji: '🍅', type: 'Vegetable', native: false, heat: 1, water: 'Daily in warm months', tip: 'Plant October–February. Kuwait summers are too hot for fruit set.' },
  { id: 'other', name: 'Other plant', nameAr: 'نبتة أخرى', emoji: '🪴', type: 'Other', native: false, heat: 2, water: 'Depends on the plant', tip: 'Every plant counts! Tell us what you grew in the notes.' },
];

export const SPECIES_IDS = new Set(SPECIES.map((s) => s.id));
