/**
 * Itinerary data transcribed from the Tencent Docs workbook "000".
 * Sheets used: 行程表 / 必带品 / 包车信息 (times only, quotes dropped).
 * 费用汇总 and 推荐店 伴手礼 are deliberately not represented on the page.
 * Weather comes from tools/fetch_weather.py, not from the workbook.
 *
 * Attached to window instead of exported as a module so index.html works when
 * opened directly from the filesystem.
 *
 * img values are keys into assets/img/<key>.jpg.
 */
window.TRIP = (function () {
  const IMG = (key) => `assets/img/${key}.jpg`;

  /* ------------------------------------------------------------------ meta */
  const meta = {
    title: '欧洲蜜月行',
    emoji: '🐱🐡🐶🐫🎨',
    subtitle: '巴黎 · 科莫湖 · 威尼斯 · 佛罗伦萨 · 罗马 · 马略卡 · 巴塞罗那',
    start: '2026-09-23',
    end: '2026-10-07',
    travellers: 5,
    source: 'https://docs.qq.com/sheet/DVEVQbkVYVWFoaW9k',
    // 4th stat is filled in from the itinerary at render time.
    stats: [
      { label: '行程天数', value: '15', unit: '天' },
      { label: '国家', value: '6', unit: '个' },
      { label: '城市/小镇', value: '13', unit: '座' },
      { label: '景点打卡', value: 'sights', unit: '处' },
    ],
  };

  /* ------------------------------------------------------------------ crew */
  // Emoji are taken from the group's own 🐱🐡🐶🐫🎨 in the order they were written;
  // only 河豚 → 🐡 is certain, so swap any line here if the pairing is off.
  const crew = [
    { name: '墨凝', emoji: '🐱' },
    { name: '河豚', emoji: '🐡' },
    { name: '美英', emoji: '🐶' },
    { name: '芳姐', emoji: '🐫' },
    { name: '如玉', emoji: '🎨' },
  ];

  /* ----------------------------------------------------------------- cities */
  // lat/lon drive the schematic route map.
  const cities = [
    { id: 'xiamen', name: '厦门', country: '中国', lat: 24.48, lon: 118.09, img: 'xiamen', kind: 'origin' },
    { id: 'singapore', name: '新加坡', country: '新加坡', lat: 1.35, lon: 103.82, img: 'singapore', kind: 'transit' },
    { id: 'doha', name: '多哈', country: '卡塔尔', lat: 25.29, lon: 51.53, img: 'doha', kind: 'transit' },
    { id: 'paris', name: '巴黎', country: '法国', lat: 48.86, lon: 2.35, img: 'paris', kind: 'stay', nights: 3 },
    { id: 'como', name: '科莫湖', country: '意大利', lat: 46.01, lon: 9.26, img: 'como', kind: 'daytrip' },
    { id: 'venice', name: '威尼斯', country: '意大利', lat: 45.44, lon: 12.32, img: 'venice', kind: 'stay', nights: 1 },
    { id: 'florence', name: '佛罗伦萨', country: '意大利', lat: 43.77, lon: 11.26, img: 'florence', kind: 'stay', nights: 1 },
    { id: 'rome', name: '罗马', country: '意大利', lat: 41.9, lon: 12.5, img: 'colosseum', kind: 'stay', nights: 2 },
    { id: 'mallorca', name: '马略卡', country: '西班牙', lat: 39.57, lon: 2.65, img: 'mallorca', kind: 'stay', nights: 3 },
    { id: 'barcelona', name: '巴塞罗那', country: '西班牙', lat: 41.39, lon: 2.17, img: 'barcelona', kind: 'stay', nights: 1 },
  ];

  /* -------------------------------------------------------------------- days */
  // status: 'booked' | 'todo' | null   (null = nothing to book)
  const days = [
    {
      n: 0,
      date: '9.23',
      weekday: '周三',
      city: '出发',
      cityId: 'xiamen',
      theme: '厦门 → 新加坡',
      img: 'xiamen',
      outfit: {
        summary: '红眼出发前 · 以舒适为主',
        lines: ['穿宽松层叠，飞机上冷随时加减', '运动鞋/平底鞋，托运行李里别只留高跟鞋'],
      },
      items: [
        { time: '19:30', title: '厦门 T3 机场集合', note: '19:30 到机场集合' },
        { time: '21:30–01:40', title: '厦门 T3 → 新加坡樟宜 T1', kind: 'flight', status: 'booked' },
      ],
    },
    {
      n: 1,
      date: '9.24',
      weekday: '周四',
      city: '新加坡',
      cityId: 'singapore',
      theme: '中转一日游',
      img: 'singapore',
      outfit: {
        summary: '新加坡闷热 · 透气 + 防雨',
        lines: ['速干短袖/薄裙，雨伞放手边', '商场/地铁空调猛，薄外套或衬衫备一件'],
      },
      items: [
        {
          time: '全天',
          title: '新加坡一日游',
          kind: 'sight',
          img: 'singapore-day',
          food: {
            title: '这一天的吃喝清单',
            groups: [
              {
                label: '早餐',
                lines: ['亚坤（连锁店，多处分店）', '招牌：咖椰吐司、半熟鸡蛋、南洋咖啡、豆浆拿铁'],
              },
              {
                label: '午餐 · 三选一',
                lines: [
                  '峇峇娘惹海南鸡饭（娘惹菜）· 克拉码头 — 白切甘榜海南鸡、小金杯',
                  '龙海鲜螃蟹王 · 牛车水 — 辣椒螃蟹、螃蟹米粉',
                  '结霜桥三轮车叻沙 · 牛车水（平价）',
                ],
              },
              { label: '甜品 · 选吃', lines: ['99 老树榴莲'] },
              {
                label: '晚餐 & 机场',
                lines: ['松花肉骨茶', 'kane mochi 冰淇淋麻薯（选吃）', 'queic by olivia 流心巴斯克（选吃）', '以上两家都在樟宜机场'],
              },
            ],
          },
        },
        { time: '16:40', title: '回到樟宜机场', note: '16:40 要到机场' },
        { time: '19:40–22:00', title: '新加坡樟宜 T1 → 多哈哈马德', kind: 'flight', status: 'todo', img: 'doha' },
      ],
    },
    {
      n: 2,
      date: '9.25',
      weekday: '周五',
      city: '巴黎',
      cityId: 'paris',
      theme: '落地即开卷',
      img: 'louvre',
      outfit: {
        summary: '降落巴黎 · 比国内凉一截',
        lines: [
          '夹层：内搭 + 薄风衣/针织，傍晚塞纳河会更凉',
          '卢浮宫到铁塔全天步行，鞋比造型重要',
          '出片可以：法式内搭 + 外套，到景点再脱',
        ],
      },
      hotel: {
        name: 'Best Western Paris Porte de Versailles',
        addr: '1 bis, Avenue Jean Jaurès',
        tel: '+33 1 40931801',
        mail: 'contacts@bwportedeversailles.com',
        nights: '9.25–9.28',
      },
      items: [
        { time: '01:30–07:30', title: '多哈哈马德 → 巴黎戴高乐 T1', kind: 'flight', status: 'booked', note: '大家需要在飞机上化好妆' },
        { time: '08:00–09:30', title: '机场 → 凡尔赛门贝斯特韦斯特酒店', kind: 'transfer', note: '包车接机 · 09:15 前须离开酒店去卢浮宫' },
        { time: '10:00–12:30', title: '卢浮宫', kind: 'sight', status: 'booked', note: '已定 10:00 · 地铁 M12 约 30 分钟', img: 'louvre' },
        { time: '12:00–13:30', title: '午餐', kind: 'food' },
        { time: '13:30–15:30', title: '香榭丽舍大道逛街', kind: 'shop', img: 'champs-elysees' },
        { time: '15:30–16:30', title: '凯旋门', kind: 'sight', img: 'arc-de-triomphe' },
        { time: '16:30–18:30', title: '晚饭', kind: 'food' },
        { time: '19:00–20:00', title: '塞纳河游船', kind: 'sight', note: '排队就 pass · 淘宝买划算', img: 'seine' },
        { time: '20:15–21:30', title: '埃菲尔铁塔', kind: 'sight', img: 'eiffel' },
        { time: '21:30–22:00', title: '回酒店', kind: 'transfer', note: '地铁约 30 分钟' },
      ],
    },
    {
      n: 3,
      date: '9.26',
      weekday: '周六',
      city: '巴黎',
      cityId: 'paris',
      theme: '左岸文艺日',
      img: 'notre-dame',
      outfit: {
        summary: '左岸 + 圣母院 · 兼顾入堂与暴走',
        lines: [
          '⛪ 巴黎圣母院：肩、膝需遮，吊带/超短裤可能被拦',
          '玛黑逛街：modest 打底最省事',
          '玛黑区 2w 步，穿能走的平底鞋',
          '爵士吧晚上：白天那套加个小配饰就行',
        ],
      },
      items: [
        { time: '08:15–09:00', title: '酒店 → 卢森堡', kind: 'transfer', note: '地铁 M12 约 35 分钟' },
        { time: '09:00–10:15', title: '卢森堡花园', kind: 'sight', note: '免预约', img: 'luxembourg' },
        { time: '10:15–11:45', title: '莎士比亚书店', kind: 'sight', img: 'shakespeare' },
        { time: '12:00–13:00', title: '午餐', kind: 'food', note: '拉丁区 / 左岸小馆' },
        { time: '13:00–14:30', title: '巴黎圣母院', kind: 'sight', status: 'todo', note: '免费 · 提前 1–2 天在线预约 · 注意着装要求', img: 'notre-dame' },
        { time: '14:30–17:30', title: '玛黑区购物', kind: 'shop', img: 'marais', note: '小红书逛店攻略 ↓', links: [
          { label: '巴黎购物分享｜给普通人的实在建议', url: 'https://www.xiaohongshu.com/discovery/item/6a6e0ba1000000003303774a?source=webshare&xhsshare=pc_web&xsec_token=AB_GtiQbPr1UCo9mZTDix8nvwtqYGU2nHipaUjaYzp5kM=&xsec_source=pc_share' },
          { label: '服装人暴走玛黑区 2w 步｜逛店附路线', url: 'https://www.xiaohongshu.com/discovery/item/68afe07f000000001d017000?source=webshare&xhsshare=pc_web&xsec_token=ABjxbOie2PouyjIzfFUDDaNEbVg6r7j6iQ6MiT3xDveSE=&xsec_source=pc_share' },
        ] },
        { time: '17:30–19:00', title: '晚饭', kind: 'food', note: '玛黑或拉丁区' },
        { time: '21:00', title: 'Le Caveau de la Huchette 爵士酒吧', kind: 'night', img: 'jazz-bar' },
      ],
    },
    {
      n: 4,
      date: '9.27',
      weekday: '周日',
      city: '巴黎',
      cityId: 'paris',
      theme: '橘园 · 奥赛 · 蒙马特',
      img: 'montmartre',
      outfit: {
        summary: '圣心堂日 · 比圣母院更严',
        lines: [
          '⛪ 圣心堂：不能无袖、超短、低胸、过于紧身',
          '建议及膝裙/长裤 + 有袖衬衫或薄针织',
          '蒙马特坡道多，放弃厚底高跟',
          '老佛爷室内逛，外层好脱',
        ],
      },
      items: [
        { time: '08:15–09:00', title: '酒店 → 橘园', kind: 'transfer', note: '地铁 M12 约 35 分钟' },
        { time: '09:00–10:15', title: '橘园美术馆', kind: 'sight', status: 'booked', note: '年卡 · 与奥赛联票 40 欧/两人', img: 'orangerie' },
        { time: '10:10–10:25', title: '步行经杜乐丽花园 → 奥赛', kind: 'transfer' },
        { time: '10:30–12:45', title: '奥赛博物馆', kind: 'sight', status: 'booked', note: '年卡', img: 'orsay' },
        { time: '12:45–13:45', title: '午餐', kind: 'food', note: '奥赛附近 / 7 区' },
        { time: '13:45–14:15', title: '去歌剧院', kind: 'transfer', note: '地铁约 15–20 分钟' },
        { time: '14:15–15:30', title: '巴黎歌剧院', kind: 'sight', status: 'booked', note: '已定 14:30', img: 'opera-garnier' },
        { time: '15:45–17:15', title: '老佛爷百货', kind: 'shop', img: 'lafayette' },
        { time: '17:15–18:00', title: '蒙马特高地', kind: 'transfer' },
        { time: '18:00–20:00', title: '爱墙、圣心堂、小丘广场', kind: 'sight', img: 'montmartre' },
      ],
    },
    {
      n: 5,
      date: '9.28',
      weekday: '周一',
      city: '巴黎 → 科莫湖 → 威尼斯',
      cityId: 'como',
      theme: '全天大迁徙',
      img: 'varenna',
      intense: true,
      outfit: {
        summary: '海陆空连轴转 · 穿着要能扛',
        lines: [
          '清晨起飞：舒适裤装 + 软壳/针织，飞机上看风景别冻着',
          '科莫湖坐船风大，薄外套别托运',
          '瓦伦纳/贝拉焦台阶多，好走的鞋',
          '深夜抵威尼斯，下火车加一层',
        ],
      },
      hotel: { name: '威尼斯梅斯特雷住宿城市公寓酒店', nights: '9.28–9.29' },
      items: [
        {
          time: '04:30–05:15',
          title: '包车送机：凡尔赛门酒店 → 巴黎奥利 T3',
          kind: 'transfer',
          note: '04:30 酒店上车 · 07:30 起飞 TO3940',
        },
        { time: '07:30–09:05', title: '巴黎奥利 T3 → 米兰马尔彭萨 T1', kind: 'flight', status: 'booked', note: '航班 TO3940' },
        { time: '09:30–10:25', title: '包车到米兰中央车站', kind: 'transfer', note: '行李直接寄存在中央车站（如 KiPoint）' },
        { time: '11:20–12:24', title: '米兰中央车站 → 瓦伦纳', kind: 'train', status: 'booked' },
        { time: '12:30–14:00', title: '瓦伦纳小镇', kind: 'sight', note: 'Villa Cipressi 10 欧/人 · Villa Monastero 13 欧/人', img: 'varenna' },
        { time: '14:30–14:45', title: '瓦伦纳 → 贝拉焦', kind: 'transfer', note: '轮渡 15 分钟，提前 20 分钟买票' },
        { time: '14:45–16:45', title: '贝拉焦', kind: 'sight', img: 'bellagio' },
        { time: '18:35–19:40', title: '瓦伦纳 → 米兰', kind: 'train', note: '取回寄存行李约 20 分钟' },
        { time: '20:45–23:17', title: '米兰 → 威尼斯（Venezia Mestre 下车）', kind: 'train', status: 'todo', note: '备选车次 19:35–21:52' },
        { time: '深夜', title: '入住威尼斯酒店', kind: 'hotel' },
      ],
      tips: ['餐厅记号：Il Carrettiere 龙虾面'],
    },
    {
      n: 6,
      date: '9.29',
      weekday: '周二',
      city: '威尼斯 → 佛罗伦萨',
      cityId: 'venice',
      theme: '补觉 + city walk',
      img: 'venice-walk',
      outfit: {
        summary: '威尼斯躺平日 · 运河边出片',
        lines: [
          '无硬性教堂要求，裙装/牛仔裤都可',
          '桥梁台阶是全场最难 walk，平底鞋必须',
          '运河边风大，薄披肩拍照也好看',
        ],
      },
      hotel: {
        name: '佛罗伦萨普鲁斯酒店',
        addr: "Via Santa Caterina D'Alessandria, 15, 50129 Firenze FI",
        tel: '055 628 6347',
        nights: '9.29–9.30',
      },
      items: [
        { time: '上午', title: '睡到自然醒', kind: 'rest' },
        { time: '白天', title: '沉船书店', kind: 'sight', img: 'venice-walk' },
        { time: '白天', title: '赤足桥', kind: 'sight', img: 'ponte-scalzi' },
        { time: '最晚 19:26–21:39', title: '威尼斯 → 佛罗伦萨', kind: 'train', status: 'todo' },
      ],
    },
    {
      n: 7,
      date: '9.30',
      weekday: '周三',
      city: '佛罗伦萨 → 罗马',
      cityId: 'florence',
      theme: '文艺复兴一日',
      img: 'florence',
      outfit: {
        summary: '佛罗伦萨一日游 · 百花大教堂要过关',
        lines: [
          '⛪ 圣母百花大教堂（入内/登穹顶）：肩、膝需遮',
          '老桥、领主广场步行多，鞋优先',
          '登米开朗基罗广场坡陡，避开细高跟',
          '晚上火车去罗马，别穿勒脚的鞋',
        ],
      },
      hotel: {
        name: 'The Independent Hotel',
        addr: 'Via Volturno, 48, 00185 Roma RM',
        tel: '06 445 2657',
        nights: '9.30–10.2',
      },
      items: [
        { time: '10:00–12:00', title: '领主广场（露天雕塑博物馆）', kind: 'sight', note: '免费', img: 'signoria' },
        { time: '12:00–13:00', title: '圣母百花大教堂', kind: 'sight', note: '免费；顺路找 wine window（Buchetta del Vino）', img: 'florence' },
        { time: '13:00–14:30', title: '老桥 维琪奥桥', kind: 'sight', note: '周杰伦 MV 取景地', img: 'ponte-vecchio' },
        { time: '14:30–16:30', title: '米开朗基罗广场', kind: 'sight', note: '到火车站大概 3–4 公里', img: 'piazzale-michelangelo' },
        { time: '19:33–21:15', title: '佛罗伦萨 → 罗马', kind: 'train', status: 'todo' },
      ],
    },
    {
      n: 8,
      date: '10.1',
      weekday: '周四',
      city: '罗马 + 梵蒂冈',
      cityId: 'rome',
      theme: '一天走完两千年',
      img: 'colosseum',
      intense: true,
      outfit: {
        summary: '上午暴晒太阳 · 下午梵蒂冈过关装',
        lines: [
          '斗兽场：帽、墨镜、防晒、透气但 modest',
          '⛪ 万神殿 & 圣依纳爵堂：入堂肩、膝遮住',
          '⛪ 圣彼得大教堂：无袖/吊带/短裤/短裙一律不行',
          '15:00 起建议：及膝裙或长裤 + 有袖（短袖 OK）',
          '备大围巾/开衫，安检不过关可临时裹上',
          '鞋：拒绝拖鞋/人字拖',
        ],
      },
      items: [
        {
          time: '08:30–11:30',
          title: '斗兽场 & 古罗马广场',
          kind: 'sight',
          status: 'todo',
          note: '先逛斗兽场 → 步行至古罗马广场 → 登帕拉蒂尼山俯瞰全景。需提前 30 天抢票',
          img: 'colosseum',
        },
        {
          time: '11:45–13:00',
          title: '蒙蒂区午餐 + 逛街',
          kind: 'food',
          note: 'Pompi 百年提拉米苏 · Al Forno Della Soffitta 龙虾意面',
          img: 'monti',
        },
        { time: '13:00–14:15', title: '万神殿 & 圣依纳爵堂', kind: 'sight', note: '圣依纳爵堂有 3D 穹顶壁画', img: 'pantheon' },
        { time: '14:15–14:45', title: '特雷维喷泉（许愿池）', kind: 'sight', img: 'trevi' },
        {
          time: '14:45–15:15',
          title: '梵蒂冈圣彼得广场',
          kind: 'transfer',
          note: '着装见当日穿搭建议 · 免费入场',
          img: 'st-peters-square',
        },
        { time: '15:15–18:30', title: '圣彼得大教堂', kind: 'sight', status: 'todo', note: '登顶需要购票', img: 'st-peters' },
        { time: '18:30 以后', title: '台伯河圣天使桥落日 & 晚餐', kind: 'sight', img: 'sant-angelo' },
      ],
    },
    {
      n: 9,
      date: '10.2',
      weekday: '周五',
      city: '罗马 → 马略卡',
      cityId: 'mallorca',
      theme: '上午暴走，下午飞海岛',
      img: 'orange-garden',
      outfit: {
        summary: '罗马上午爬坡 · 下午飞海岛换度假风',
        lines: [
          '上午真理之口/橘子公园：modest 轻便，好走的鞋',
          '如进周边小堂：肩、膝基本遮住即可',
          '下午飞马略卡，机上可换更轻薄；入境后短袖 + 薄外套',
        ],
      },
      items: [
        { time: '08:30–09:00', title: '真理之口', kind: 'sight', note: '退房寄行李后打车前往 · 排队就 pass', img: 'bocca' },
        { time: '09:15–10:45', title: '橘子公园', kind: 'sight', img: 'orange-garden' },
        { time: '顺路', title: '马耳他骑士团广场（钥匙孔）', kind: 'sight', note: '距橘子公园步行 2 分钟', img: 'malta-keyhole' },
        { time: '10:45–11:45', title: '慢悠悠下山，山脚喝杯咖啡', kind: 'food' },
        { time: '11:00–11:25', title: '打车回酒店取行李', kind: 'transfer', note: '机场大巴或出租车' },
        { time: '11:25–12:15', title: '12:15 抵达机场', kind: 'transfer' },
        { time: '14:50–16:40', title: '罗马费尤米奇诺 → 帕尔马马拉尔克', kind: 'flight', status: 'booked' },
        { time: '16:50–17:30', title: '下飞机、过海关、取行李', kind: 'transfer', note: '申根内部很快' },
        { time: '17:30–18:30', title: '机场提车', kind: 'car', status: 'booked', note: '租车 3 天' },
        { time: '18:30–19:15', title: '自驾前往市区酒店', kind: 'car' },
        { time: '19:30 以后', title: '马略卡夜生活 & 西班牙晚餐', kind: 'night', img: 'palma' },
      ],
    },
    {
      n: 10,
      date: '10.3',
      weekday: '周六',
      city: '马略卡',
      cityId: 'mallorca',
      theme: '山中小镇自驾',
      img: 'soller',
      outfit: {
        summary: '马略卡自驾 · 山风 + 小镇',
        lines: [
          '驾驶舒适：裤装 + 薄层，方便上下车',
          '索列尔/瓦尔德摩萨海拔略高，比海边凉，带件外套',
          '无教堂硬性要求，色彩亮一点出片',
        ],
      },
      items: [
        { time: '08:00–08:40', title: '自驾到索列尔', kind: 'car', note: '走隧道快速路线，约 40 分钟' },
        { time: '08:40–10:30', title: '索列尔小镇漫步 + brunch', kind: 'sight', img: 'soller' },
        { time: '10:30–11:05', title: '索列尔 → 瓦尔德摩萨', kind: 'car' },
        { time: '11:05–12:30', title: '瓦尔德摩萨小镇漫步', kind: 'sight', img: 'valldemossa' },
        { time: '15:45–16:30', title: '福门托尔灯塔', kind: 'sight', img: 'formentor-lighthouse' },
        { time: '16:30–17:00', title: '福门托尔角', kind: 'sight', note: '看日落', img: 'formentor' },
      ],
    },
    {
      n: 11,
      date: '10.4',
      weekday: '周日',
      city: '马略卡',
      cityId: 'mallorca',
      theme: '溶洞音乐会 + 果冻海',
      img: 'cala-llombards',
      outfit: {
        summary: '溶洞 + 果冻海 · 泳装日',
        lines: [
          '龙洞洞内凉，比海边低好几度，带薄长袖',
          '三连海滩：泳衣穿里面，外面罩衫/沙滩裙，夹脚拖 OK',
          '帕尔马 city walk 晚上：换干衣服 + 薄外套',
        ],
      },
      items: [
        {
          time: '08:30–09:30',
          title: '开车前往龙洞（Cuevas del Drach）',
          kind: 'car',
          status: 'todo',
          note: '需 30 天以内预约 cuevasdeldrach.com',
        },
        { time: '10:00–11:00', title: '游览溶洞 & 洞内音乐会', kind: 'sight', img: 'drach' },
        {
          time: '11:30–14:30',
          title: '果冻海三连：Cala Llombards / Caló des Moro / Cala s\u2019Almunia',
          kind: 'sight',
          img: 'cala-llombards',
        },
        { time: '14:30–15:30', title: '返回帕尔马市区', kind: 'car' },
        { time: '15:30 之后', title: '帕尔马市区 city walk', kind: 'sight', img: 'palma' },
      ],
    },
    {
      n: 12,
      date: '10.5',
      weekday: '周一',
      city: '马略卡 → 巴塞罗那',
      cityId: 'barcelona',
      theme: '高迪日',
      img: 'sagrada',
      intense: true,
      outfit: {
        summary: '05:30 起床 · 上午教堂下午山高',
        lines: [
          '⛪ 圣家堂：肩需遮、裙/裤过膝，热裤/吊带不行',
          '一早进城：穿能直接进教堂的一套，别指望外面现买',
          '⛪ Tibidabo 圣心：风大需长袖 + 入堂 modest',
          '圣家堂光线 13:00 前后最好，外套选易脱的',
          '爬山 + 缆车，运动鞋；日落后下山会冷',
        ],
      },
      hotel: {
        name: '卡斯蒂利亚阿提亚姆酒店',
        addr: 'Carrer de Valldonzella, 5, Ciutat Vella, 08001 Barcelona',
        tel: '933 18 21 82',
        nights: '10.5–10.6',
      },
      items: [
        { time: '05:30–06:15', title: '起床退房，驾车到帕尔马机场还车', kind: 'car' },
        { time: '07:45–08:40', title: '马略卡 → 巴塞罗那', kind: 'flight', status: 'booked', note: '注意：大家需要在飞机上化好妆' },
        { time: '08:40–09:40', title: '机场 → 卡斯蒂利亚阿提亚姆酒店', kind: 'transfer' },
        { time: '10:30–12:30', title: '巴特罗之家（入内）+ 米拉之家（外部打卡）', kind: 'sight', img: 'casa-batllo' },
        { time: '12:45–14:15', title: '圣家堂', kind: 'sight', status: 'todo', note: '约 13:00 光线最好', img: 'sagrada' },
        { time: '14:30–15:45', title: '午餐', kind: 'food' },
        {
          time: '15:30–16:30',
          title: '出发前往 Tibidabo 山',
          kind: 'transfer',
          note: 'Peu del Funicular 地铁站坐第二节车厢 → 缆车 → 111 路公交',
        },
        { time: '16:30–19:00', title: '圣心大教堂', kind: 'sight', note: 'Tibidabo · 山上风大；看日落缆车 · 着装见当日穿搭', img: 'tibidabo' },
      ],
    },
    {
      n: 13,
      date: '10.6',
      weekday: '周二',
      city: '巴塞罗那 → 回国',
      cityId: 'barcelona',
      theme: '买买买 + 退税',
      img: 'passeig-de-gracia',
      outfit: {
        summary: '巴塞罗那购物日 · 轻松好看',
        lines: [
          '毕加索博物馆/格拉西亚大道：步行友好鞋 + 薄外套',
          '无教堂硬性要求，背小包方便退税血拼',
          '晚上飞长途，穿飞机上最舒服那套',
        ],
      },
      items: [
        { time: '08:30–09:00', title: '酒店退房，箱子寄存酒店', kind: 'hotel' },
        { time: '09:15–10:45', title: '毕加索博物馆', kind: 'sight', img: 'picasso-museum' },
        {
          time: '11:30–13:00',
          title: '英国宫百货',
          kind: 'shop',
          note: '服务中心拿 10% 国际游客优惠卡；伊比利亚火腿、橄榄油等伴手礼',
          img: 'el-corte-ingles',
        },
        { time: '14:30–18:00', title: '格拉西亚大道购物', kind: 'shop', img: 'passeig-de-gracia' },
        { time: '18:30–19:30', title: '出发去机场', kind: 'transfer', note: '包车' },
        { time: '19:30–21:30', title: 'DIVA 电子退税、托运、安检', kind: 'transfer' },
        { time: '22:55', title: '起飞回国（巴塞罗那埃尔普拉特 T1 → 多哈）', kind: 'flight', status: 'booked' },
      ],
    },
  ];

  /* -------------------------------------------------------- 欧洲段交通 */
  // Schedule only — no fares. status: 'booked' | 'todo' | 'onsite'
  const euroLegs = [
    { date: '9.28', time: '07:30–09:05', from: '巴黎奥利 T3', to: '米兰马尔彭萨 T1', mode: 'flight', ref: '航班 TO3940', status: 'booked' },
    { date: '9.28', time: '11:20–12:24', from: '米兰中央车站', to: '瓦伦纳', mode: 'train', status: 'booked' },
    { date: '9.28', time: '14:30–14:45', from: '瓦伦纳', to: '贝拉焦', mode: 'ferry', ref: '轮渡 15 分钟，提前 20 分钟买票', status: 'onsite' },
    { date: '9.28', time: '18:35–19:40', from: '瓦伦纳', to: '米兰', mode: 'train', status: 'todo' },
    { date: '9.28', time: '20:45–23:17', from: '米兰', to: '威尼斯 Venezia Mestre', mode: 'train', ref: '备选 19:35–21:52', status: 'todo' },
    { date: '9.29', time: '最晚 19:26–21:39', from: '威尼斯', to: '佛罗伦萨', mode: 'train', status: 'todo' },
    { date: '9.30', time: '19:33–21:15', from: '佛罗伦萨', to: '罗马', mode: 'train', status: 'todo' },
    { date: '10.2', time: '14:50–16:40', from: '罗马费尤米奇诺', to: '帕尔马马拉尔克', mode: 'flight', status: 'booked' },
    { date: '10.2–10.5', time: '3 天', from: '帕尔马机场提车', to: '帕尔马机场还车', mode: 'car', ref: '马略卡自驾，需带驾驶证原件', status: 'booked' },
    { date: '10.5', time: '07:45–08:40', from: '帕尔马', to: '巴塞罗那', mode: 'flight', status: 'booked' },
  ];

  /* ------------------------------------------------------------ 接送机安排 */
  // Times only, taken from the 包车信息 sheet and cross-checked against 行程表.
  // dir: 'pickup' = 接机, 'dropoff' = 送机
  const transfers = [
    {
      date: '9.25',
      dir: 'pickup',
      from: '巴黎戴高乐 T1',
      to: '凡尔赛门贝斯特韦斯特酒店',
      flight: '01:30–07:30 多哈 → 巴黎，07:30 落地',
      time: '08:00 上车 · 09:30 到酒店',
    },
    {
      date: '9.28',
      dir: 'dropoff',
      from: '凡尔赛门贝斯特韦斯特酒店',
      to: '巴黎奥利机场 T3',
      flight: '07:30 起飞 → 米兰',
      time: '04:30 酒店上车 · 约 05:00–05:15 到奥利 T3',
      note: '航班 TO3940 · 5 人行李，提前约 2 小时到机场',
    },
    {
      date: '9.28',
      dir: 'pickup',
      from: '米兰马尔彭萨 T1',
      to: '米兰中央车站',
      flight: '09:05 落地',
      time: '09:30 上车 · 10:25 到车站',
      note: '接送机表里这段的终点写的是米兰的 Best Western Hotel Major，但当天不在米兰过夜，实际是送到中央车站寄存行李',
    },
    {
      date: '10.2',
      dir: 'dropoff',
      from: '罗马 The Independent Hotel',
      to: '罗马费尤米奇诺机场',
      flight: '14:50 起飞 → 帕尔马',
      time: '11:30 上车 · 12:15 到机场',
      note: '这一段没人报价，行程表里写的是机场大巴或出租车',
    },
    {
      date: '10.5',
      dir: 'pickup',
      from: '巴塞罗那埃尔普拉特 T2',
      to: '巴塞罗那市区酒店',
      flight: '帕尔马 → 巴塞罗那',
      time: '08:40 上车 · 09:40 到酒店',
      note: '航班时间两张表对不上：行程表写 07:45–08:40，接送机表写 19:45–20:40。上车时间得按最后确认的那班来',
    },
    {
      date: '10.6',
      dir: 'dropoff',
      from: 'Arago 312, 巴塞罗那',
      to: '巴塞罗那埃尔普拉特 T1',
      flight: '22:50 起飞 → 多哈',
      time: '18:30 上车 · 19:30 到机场',
    },
  ];

  /* ------------------------------------------------- 天气（近十年同期实测） */
  // Built by tools/fetch_weather.py from Open-Meteo's archive: the average of
  // 2015–2024 for exactly the days we are in each place.
  const weather = {
    source: '近 10 年（2015–2024）同期实测平均 · Open-Meteo',
    // start/end let app.js ask Open-Meteo for the real forecast once we are
    // inside its 16-day window; until then the averages below are shown.
    places: [
      { key: 'singapore', label: '新加坡', days: '9.24', start: '2026-09-24', end: '2026-09-24', high: 29.9, low: 24.6, wet: 0.80, hint: '闷热，十年里八年这天在下雨，伞放手边' },
      { key: 'paris', label: '巴黎', days: '9.25–9.28', start: '2026-09-25', end: '2026-09-28', high: 18.9, low: 10.9, wet: 0.40, hint: '全程最冷的一段，早晚十来度，外套必备' },
      { key: 'como', label: '科莫湖', days: '9.28', start: '2026-09-28', end: '2026-09-28', high: 21.5, low: 14.4, wet: 0.30, hint: '湖上坐船风大，薄外套带着' },
      { key: 'venice', label: '威尼斯', days: '9.28–9.29', start: '2026-09-28', end: '2026-09-29', high: 22.0, low: 14.8, wet: 0.20, hint: '白天舒服，深夜到酒店会凉' },
      { key: 'florence', label: '佛罗伦萨', days: '9.29–9.30', start: '2026-09-29', end: '2026-09-30', high: 23.6, low: 12.8, wet: 0.20, hint: '日夜温差 11 度，穿能脱能穿的' },
      { key: 'rome', label: '罗马', days: '9.30–10.2', start: '2026-09-30', end: '2026-10-02', high: 23.8, low: 15.2, wet: 0.30, hint: '斗兽场没遮阴，防晒和水带够' },
      { key: 'mallorca', label: '马略卡', days: '10.2–10.5', start: '2026-10-02', end: '2026-10-05', high: 25.1, low: 18.0, wet: 0.28, hint: '最暖的一段，泳衣用得上' },
      { key: 'barcelona', label: '巴塞罗那', days: '10.5–10.6', start: '2026-10-05', end: '2026-10-06', high: 23.3, low: 16.0, wet: 0.20, hint: '短袖加薄外套刚好' },
    ],
  };

  /* -------------------------------------------------------------- 旅行宣誓 */
  const oath = {
    title: '旅行宣誓',
    lead: '我宣誓，本次旅行：',
    lines: [
      '绝不抱怨、不喊累、不甩脸子！',
      '绝不说「早知道不来了」「这有啥好看的」「还不如在家躺着」！',
      '绝不说「太贵了，你们去我不去」「我累了，你们玩吧」！',
      '不摆脸色，不互相埋怨，有话直说积极解决问题！',
      '拍照积极配合，绝不敷衍说「你就长那样」！',
    ],
    motto: ['我们宗旨是：计划为辅，开心为主！', '高高兴兴出门，开开心心回家！'],
  };

  /* --------------------------------------------------------------- 必带品 */
  const packing = [
    { item: '38mm 卷发棒', who: '墨凝' },
    { item: '玉米须 + 拉直板', who: '河豚' },
    { item: '化妆包', who: '全员' },
    { item: '欧洲电话卡', who: '美英' },
    { item: '信用卡', who: '河豚、墨凝' },
    { item: '一次性内裤', who: '全员' },
    { item: '行李锁', who: '全员' },
    { item: '充电宝', who: '全员' },
    { item: '护发精油', who: '全员', note: '那边水质硬' },
    { item: '雨伞', who: '全员' },
    { item: '牙膏牙刷', who: '全员' },
    { item: '头梳', who: '全员' },
    { item: '浴巾', who: '全员' },
    { item: '卸妆膏', who: '' },
    { item: '洗面奶', who: '' },
    { item: '洗脸巾', who: '河豚、芳姐' },
    { item: '入境材料', who: '全员' },
    { item: '隔离膜', who: '芳姐' },
    { item: '药包', who: '河豚', note: '感冒药、止疼药、肠胃药' },
    { item: '雨鞋或者鞋套', who: '全员' },
    { item: '创可贴', who: '墨凝' },
    { item: '拖鞋', who: '' },
    { item: '驾驶证原件', who: '墨凝、芳姐', note: '马略卡自驾必备' },
    { item: '车载支架', who: '' },
    { item: '便携烧水壶', who: '如玉' },
    { item: '洗衣液', who: '' },
    { item: '过滤花洒', who: '' },
    { item: '压力袜', who: '', note: '防止腿水肿，按需' },
    { item: '眼罩', who: '' },
    { item: '飞机腰枕', who: '' },
    { item: '大围巾/薄开衫', who: '全员', note: '进教堂不过关时可临时披肩' },
    { item: '泳衣', who: '', note: '马略卡果冻海' },
    { item: '堵门神器', who: '美英' },
    { item: '警报器', who: '美英' },
    { item: '辣椒水', who: '' },
    { item: '定位器', who: '' },
  ];

  return { meta, crew, cities, days, euroLegs, transfers, weather, oath, packing, IMG };
})();
