#!/usr/bin/env python3
"""
Fetch GPS coordinates for Indian cities using Nominatim OpenStreetMap API.
Saves results to src/data/cityCoords.json. Resumable: skips cities already present.
"""

import json
import time
import urllib.request
import urllib.parse
import urllib.error
import os

OUTPUT_PATH = "/home/altos/dashboard/src/data/cityCoords.json"
USER_AGENT = "airtel-network-map/1.0"
BASE_URL = "https://nominatim.openstreetmap.org/search"

CITIES = {
    "Andaman And Nicobar Islands": ["PORTBLAIR", "PORT BLAIR"],
    "Andhra Pradesh": [
        "ADDANKI", "ADONI", "AMALAPURAM", "ANAKAPALLE", "ANANTAPUR", "ANGALLU",
        "BADVEL", "BAPATLA", "BHIMAVARAM", "BOBBILI", "BUCHIREDDYPALEM",
        "CHILAKALURIPET", "CHIMAKURTHY", "CHITTOOR", "CUDDAPAH", "DHONE",
        "ELURU", "GIDDALUR", "GUDIVADA", "GUDUR", "GUNTAKAL", "GUNTUR",
        "HINDUPUR", "IBRAHIMPATNAM", "JAGGAIAHPET", "JAMMALAMADUGU",
        "JANGAREDDYGUDEM", "KADIRI", "KADIYAM", "KAKINADA", "KANDUKUR",
        "KANIGIRI", "KAVALI", "KODURU", "KOVUR", "KOVVUR", "KURNOOL",
        "MACHERLA", "MACHILIPATNAM", "MADANAPALLE", "MANDAPETA", "MANGALAGIRI",
        "MARKAPUR", "NAGARI", "NAIDUPETA", "NANDIGAMA", "NANDYAL", "NARASAPUR",
        "NARASARAOPET", "NELLORE", "NIDADAVOLE", "NUZVID", "ONGOLE", "PALAKOLLU",
        "PALAMANER", "PARIGI", "PARVATHIPURAM", "PENUKONDA", "PIDUGURALLA",
        "PILER", "PITHAPURAM", "PONNUR", "PRODDATUR", "PULIVENDULA", "PUNGANUR",
        "RAJAHMUNDRY", "RAJAM", "RAJAMPET", "RAMACHANDRAPURAM", "RAYACHOTI",
        "SALUR", "SAMALKOT", "SATTENAPALLE", "SINGARAYAKONDA", "SRIKAKULAM",
        "SRIKALAHASTI", "TADEPALLI", "TADEPALLIGUDEM", "TADIPATRI", "TANUKU",
        "TENALI", "TIRUPATHI", "TUNI", "VIJAYAWADA", "VINUKONDA",
        "VISAKHAPATNAM", "VIZIANAGARAM", "VUYYURU",
    ],
    "Arunachal Pradesh": [
        "BOMDILA", "DAPORIJO", "ITANAGAR", "NAHARLAGUN", "NAMSAI",
        "TAWANG", "TEZU", "ZIRO",
    ],
    "Assam": [
        "BARPETA", "BARPETA ROAD", "BONGAIGAON", "DHEKIAJULI", "DHUBRI",
        "DIBRUGARH", "DIGBOI", "DOBOKA", "DOOM DOOMA", "DULIAJAN",
        "GOALPARA", "GOLAGHAT", "GUWAHATI", "HAFLONG", "HAILAKANDI",
        "HOJAI", "JORHAT", "LEDO", "LUMDING", "MANGALDOI", "MARGHERITA",
        "MARIANI", "MIRZA", "MORAN", "MORIGAON", "NAGAON", "NALBARI",
        "NAZIRA", "NORTH LAKHIMPUR", "PATHSALA", "RANGIA", "SIBSAGAR",
        "SILAPATHAR", "SILCHAR", "SIVASAGAR", "SONARI", "TEZPUR", "TINSUKIA",
    ],
    "Bihar": [
        "ARARIA", "ARRAH", "BAGAHA", "BAKHTIYARPUR", "BANKA", "BARAUNI",
        "BARBIGHA", "BARH", "BEGUSARAI", "BENIPATTI", "BETTIAH", "BHABHUA",
        "BHAGALPUR", "BIDUPUR", "BIHARIGANJ", "BIHARSHARIF", "BIHTA",
        "BIKRAMGANJ", "BIRPUR", "BUXAR", "CHAPRA", "CHORSUA", "DALSINGHSARAI",
        "DANAPUR", "DARBHANGA", "DAUDNAGAR", "DEHRI ON SONE", "DUMRAON",
        "FATWAH", "FORBESHGANJ", "GAYA", "GOGRI JAMALPUR", "GOPALGANJ",
        "HAJIPUR", "HARNAUT", "JAHANABAD", "JALLEY", "JAMALPUR", "JAMUI",
        "JAYNAGAR", "JEHANABAD", "JHAJHA", "JHANJHARPUR", "KAHALGAON", "KANTI",
        "KATIHAR", "KHAGARIA", "KISHANGANJ", "KOCHAS", "KUDRA", "LAKHISARAI",
        "MADHEPURA", "MADHUBANI", "MAHUA", "MANER", "MASAURHI", "MIRGANJ",
        "MOTIHARI", "MUNGER", "MUZAFFARPUR", "NABINAGAR", "NALANDA", "NAUGACHIA",
        "NAWADA", "PATNA", "PIRO", "PUPRI", "PURNIA", "RAJGIR", "RAXAUL",
        "SAHARSA", "SAMASTIPUR", "SASARAM", "SHEIKHPURA", "SHEOHAR", "SHERGHATI",
        "SIMRI BAKHTIARPUR", "SITAMARHI", "SIWAN", "SONPUR", "SUPAUL", "TEGHRA",
        "TRIBENIGANJ",
    ],
    "Chhattisgarh": [
        "AMBIKAPUR", "BEMETARA", "BHILAI", "BILASPUR", "DHAMTARI",
        "DONGARGARH", "DURG", "JAGDALPUR", "KANKER", "KAWARDHA",
        "KONDAGAON", "KORBA", "KUMHARI", "MAHASAMUND", "MANENDRAGARH",
        "RAIGARH", "RAIPUR", "RAJNANDGAON",
    ],
    "Dadra And Nagar Haveli": ["DAMAN", "JUNAGADH", "SILVASSA", "VALSAD"],
    "Goa": [
        "MAPUSA", "MARGAO", "PANAJI", "PONDA", "PORVORIM", "USGAO", "VASCODAGAMA",
    ],
    "Gujarat": [
        "AHMEDABAD", "AMRELI", "ANAND", "ANJAR", "ANKLESHWAR", "BALASINOR",
        "BARDOLI", "BAREJA", "BARODA", "BAVLA", "BHACHAU", "BHARUCH",
        "BHAVNAGAR", "BHILAD", "BHUJ", "BILLIMORA", "BOPAL", "BORSAD",
        "BOTAD", "CHANASMA", "CHANGODAR", "CHHATRAL", "CHIKHLI", "DAHOD",
        "DEESA", "DEHGAM", "DHANERA", "DHARAMPUR", "DHOLKA", "DHORAJI",
        "DWARKA", "GANDHI NAGAR", "GANDHIDHAM", "GODHRA", "HALOL",
        "HIMATNAGAR", "JAMNAGAR", "JETPUR", "KADI", "KADODARA", "KALOL",
        "KAMREJ", "KAPADVANJ", "KHEDA", "KIM", "KOSAMBA", "LIMBDI",
        "LUNAWADA", "MAHESANA", "MAHUVA", "MANDVI", "MANGROL", "MODASA",
        "MORBI", "MUNDRA", "NADIAD", "NAKHATRANA", "NAVSARI", "PALANPUR",
        "PARDI", "RAJKOT", "RAJPIPLA", "RAJULA", "SANAND", "SAVARKUNDLA",
        "SIHOR", "SURAT", "SURENDRANAGAR", "UMARGAM", "UMRETH", "UNJHA",
        "UPLETA", "VADODARA", "VAPI", "VERAVAL", "WANKANER",
    ],
    "Haryana": [
        "AMBALA", "ASSANDH", "BAHADURGARH", "BARWALA", "BAWAL", "BHIWANI",
        "BHUNA", "CHARKHIDADRI", "CHEEKA", "CHHACHHRAULI", "ELLENABAD",
        "FATEHABAD", "GHARAUNDA", "GOHANA", "HANSI", "HATHIN", "HISAR",
        "HODAL", "JHAJJAR", "JIND", "KAITHAL", "KALANWALI", "KALKA",
        "KARNAL", "KHARKHODA", "KOSLI", "KURUKSHETRA", "LADWA", "MAHAM",
        "MAHENDRAGARH", "MEWAT", "NARAINGARH", "NARNAUL", "NARWANA",
        "PALWAL", "PANCHKULA", "PANIPAT", "PEHOWA", "PINJORE", "REWARI",
        "ROHTAK", "SAFIDON", "SAMALKHA", "SHAHBAD", "SIRSA", "SOHNA",
        "SONIPAT", "TOHANA", "TOSHAM", "UCHANA", "YAMUNANAGAR",
    ],
    "Himachal Pradesh": [
        "AMB", "BADDI", "BAIJNATH", "CHAMBA", "DAULATPUR", "DHARAMSHALA",
        "GAGRET", "GHUMARWIN", "HAMIRPUR", "JASSUR", "JAWALI",
        "JOGINDER NAGAR", "KANGRA", "KASAULI", "KULLU", "KUMARHATTI",
        "MANALI", "MANDI", "NADAUN", "NAGROTA BAGWAN", "NAGROTA SURIAN",
        "NAHAN", "NALAGARH", "NER CHOWK", "NURPUR", "PALAMPUR",
        "PAONTA SAHIB", "PARWANOO", "REHAN", "ROHRU", "SHIMLA",
        "SOLAN", "SUNDER NAGAR", "UNA",
    ],
    "Jammu And Kashmir": [
        "AKHNOOR", "ANANTHNAG", "AWANTIPORA", "BANDIPORE", "BARAMULLA",
        "BARI BRAHMANA", "BASOHLI", "BHADERWAH", "BILLAWAR", "BUDGAM",
        "CHADOORA", "DODA", "DOORU", "GANDERBAL", "JAMMU", "KATHUA",
        "KATRA", "KISHTWAR", "KULGAM", "KUPWARA", "NAUSHERA", "PAHALGAM",
        "PAMPORE", "PATTAN", "POONCH", "PULWAMA", "QAZIGUND", "RAJOURI",
        "RAMBAN", "REASI", "SAMBA", "SHOPIAN", "SOPORE", "SRINAGAR",
        "UDHAMPUR",
    ],
    "Jharkhand": [
        "ADITYAPUR", "BARHI", "BOKARO", "BUNDU", "CHAIBASA", "CHAKRADHARPUR",
        "CHATRA", "CHIRKUNDA", "DALTONGANJ", "DEOGHAR", "DHANBAD", "DUMKA",
        "GARHWA", "GHATSHILA", "GIRIDIH", "GOBINDPUR", "GODDA", "GOMOH",
        "GUMLA", "HAZARIBAGH", "JAMSHEDPUR", "JAMTARA", "JHUMRI TILAIYA",
        "KHUNTI", "LOHARDAGA", "MADHUPUR", "MAHAGAMA", "NIRSA", "NOAMUNDI",
        "PAKUR", "PATRATU", "PHUSRO", "RAJMAHAL", "RAMGARH", "RANCHI",
        "SAHIBGANJ", "TANDWA",
    ],
    "Karnataka": [
        "ALAND", "ANEKAL", "ANKOLA", "ARSIKERE", "ATHANI", "BADAMI",
        "BAGALKOT", "BAGEPALLI", "BAILHONGAL", "BANGALORE", "BANGARAPET",
        "BANTWAL", "BASAVAKALYAN", "BELGAUM", "BELLARY", "BHADRAVATI",
        "BHALKI", "BHATKAL", "BIDADI", "BIDAR", "BIJAPUR", "BILGI",
        "CHALLAKERE", "CHAMRAJNAGAR", "CHANNAPATNA", "CHANNARAYAPATNA",
        "CHIKKABALLAPUR", "CHIKMAGALUR", "CHIKODI", "CHINTAMANI",
        "CHITRADURGA", "DANDELI", "DAVANAGERE", "DHARWAD", "DODDABALLAPUR",
        "GADAG", "GANGAVATHI", "GAURIBIDANUR", "GOKAK", "GULBARGA",
        "GUNDLUPET", "HARAPANAHALLI", "HARIHAR", "HAROHALLI", "HASSAN",
        "HAVERI", "HIRIYUR", "HOSKOTE", "HOSPET", "HUBLI", "HUMNABAD",
        "HUNSUR", "ILKAL", "INDI", "JAMKHANDI", "KAMPLI", "KANAKAPURA",
        "KARKALA", "KARWAR", "KOLAR", "KOPPAL", "KUMTA", "KUNDAPURA",
        "KUNIGAL", "KUSHALNAGAR", "LINGSUGUR", "MADDUR", "MADIKERI",
        "MAGADI", "MAHALINGPUR", "MALAVALLI", "MALUR", "MANDYA",
        "MANGALORE", "MANIPAL", "MANVI", "MOODBIDRI", "MUDDEBIHAL",
        "MUDHOL", "MULBAGAL", "MYSORE", "NANJANGUD", "NIPPANI", "PUTTUR",
        "RAICHUR", "RAMANAGARA", "RANIBENNUR", "SANDUR", "SANKESHWAR",
        "SAUNDATTI", "SHAHAPUR", "SHIKARIPURA", "SHIMOGA", "SIDLAGHATTA",
        "SINDGI", "SINDHANUR", "SIRA", "SIRSI", "SIRUGUPPA", "SRINIVASPUR",
        "THIRTHAHALLI", "TIPTUR", "TORANAGALLU", "TUMKUR", "UDUPI",
        "VIJAYAPURA", "YADGIR",
    ],
    "Kerala": [
        "ADOOR", "ALAPPUZHA", "ALATHUR", "AROOR", "CALICUT", "CHALAKUDY",
        "CHANGANASSERY", "CHENGANNUR", "CHERTHALA", "CHITTUR", "COCHIN",
        "ERATTUPETTA", "IRINJALAKUDA", "KAKKODI", "KANHANGAD", "KANJIKODE",
        "KANNUR", "KASARAGOD", "KODUNGALLUR", "KOLLAM", "KONDOTTY",
        "KOTTAKKAL", "KOTTARAKKARA", "KOTTAYAM", "KOYILANDY", "KUNDARA",
        "KUNNAMANGALAM", "MALAPPURAM", "MANJERI", "MUVATTUPUZHA", "PALAKKAD",
        "PERINTHALMANNA", "PERUMBAVOOR", "PONNANI", "POTHENCODE",
        "RAMANATTUKARA", "THALASSERY", "THIRUVALLA", "THIRUVANANTHAPURAM",
        "THODUPUZHA", "THRISSUR", "TIRUR", "TIRURANGADI", "VADAKARA",
        "VAIKOM", "VALANCHERY",
    ],
    "Ladakh": ["KARGIL", "LEH", "NUBRA"],
    "Madhya Pradesh": [
        "ASHOK NAGAR", "ASHTA", "BALAGHAT", "BETUL", "BHIND", "BHOPAL",
        "BIAORA", "BURHANPUR", "CHHATARPUR", "CHHINDWARA", "DABRA",
        "DAMOH", "DATIA", "DEWAS", "DHAR", "GANJ BASODA", "GUNA",
        "GWALIOR", "HARDA", "HOSHANGABAD", "INDORE", "ITARSI", "JABALPUR",
        "JAORA", "KATNI", "KHANDWA", "KHARGONE", "MAIHAR", "MANDIDEEP",
        "MANDSAUR", "MHOW", "MORENA", "NAGDA", "NEEMUCH", "PIPARIYA",
        "PITHAMPUR", "RAJGARH", "RATLAM", "REWA", "SAGAR", "SANAWAD",
        "SATNA", "SEHORE", "SENDHWA", "SEONI", "SHAHDOL", "SHIVPURI",
        "SINGRAULI", "TIKAMGARH", "UJJAIN", "VIDISHA",
    ],
    "Maharashtra": [
        "ACHALPUR", "AHMED NAGAR", "AHMEDPUR", "AJARA", "AKKALKOT", "AKLUJ",
        "AKOLA", "AKOLE", "AKOT", "ALEPHATA", "ALIBAG", "AMALNER", "AMBAD",
        "AMBARNATH", "AMBEJOGAI", "AMRAVATI", "ANJANGAON SURJI", "ATPADI",
        "AURANGABAD", "AUSA", "BADLAPUR", "BALLARPUR", "BARAMATI", "BARSHI",
        "BASMAT", "BEED", "BHADGAON", "BHAMBOLI", "BHOKARDAN", "BHUSAWAL",
        "BRAHMAPURI", "BULDHANA", "BUTIBORI", "CHAKUR", "CHALISGAON",
        "CHANDRAPUR", "CHANDWAD", "CHIKHALI", "CHIPLUN", "CHOPDA", "DAPOLI",
        "DAUND", "DEGLOOR", "DHULE", "DIGRAS", "DOMBIVALI", "FAIZPUR",
        "GADCHIROLI", "GADHINGLAJ", "GANGAKHED", "GONDIA", "HADGAON",
        "HINGNA", "HINGOLI", "HUPARI", "ICHALKARANJI", "INDAPUR", "JALGAON",
        "JALNA", "JATH", "JAYSINGPUR", "JUNNAR", "KALAMB", "KALYAN",
        "KAMPTEE", "KAMSHET", "KARAD", "KARANJA", "KHAMGAON", "KHED",
        "KHOPOLI", "KOLHAPUR", "KOPARGAON", "KORADI", "KOREGAON", "LATUR",
        "LONAND", "LONAVALA", "MAHABALESHWAR", "MAJALGAON", "MALEGAON",
        "MANGRULPIR", "MANMAD", "MAUDA", "MOHOL", "MUMBAI", "MUMBRA",
        "MURTIZAPUR", "MURUD", "NAGPUR", "NANDED", "NANDGAON", "NANDURBAR",
        "NARAYANGAON", "NASHIK", "NATEPUTE", "NILANGA", "NIPHAD",
        "OSMANABAD", "OZAR", "PACHORA", "PALUS", "PANCHGANI", "PANDHARPUR",
        "PANVEL", "PARANDA", "PARATWADA", "PARBHANI", "PARLI", "PARTUR",
        "PATAN", "PHALTAN", "PIMPALGAON", "PUNE", "PURNA", "PUSAD",
        "RAHURI", "RAJURA", "RANJANGAON", "RATNAGIRI", "SANGAMNER",
        "SANGLI", "SANGOLA", "SAONER", "SASWAD", "SATARA", "SAVDA",
        "SAWANTWADI", "SELU", "SHAHADA", "SHEVGAON", "SHIKRAPUR",
        "SHIRPUR", "SHIRUR", "SILLOD", "SINNAR", "SOLAPUR", "TALEGAON DABHADE",
        "TALOJA", "TASGAON", "TEMBHURNI", "TRIMBAKESHWAR", "TULJAPUR",
        "UDGIR", "ULLHASNAGAR", "ULWE", "UMARGA", "URAN", "VAIJAPUR",
        "VITA", "WAI", "WANI", "WARDHA", "WARORA", "WASHIM", "YAVATMAL", "YAWAL",
    ],
    "Manipur": [
        "BISHNUPUR", "CHURACHANDPUR", "IMPHAL", "MOIRANG", "SENAPATI",
        "THOUBAL", "UKHRUL",
    ],
    "Meghalaya": ["SHILLONG"],
    "Mizoram": [
        "AIZAWL", "CHAMPHAI", "KHAWZAWL", "KOLASIB", "LAWNGTLAI",
        "LUNGLEI", "SAITUAL", "SIAHA",
    ],
    "NCR": ["DELHI", "FARIDABAD", "GHAZIABAD", "GURGAON", "NEW DELHI", "NOIDA"],
    "Nagaland": ["DIMAPUR", "KOHIMA", "MOKOKCHUNG", "MON", "TUENSANG"],
    "Orissa": [
        "ANGUL", "ASKA", "BALANGIR", "BALASORE", "BALUGAON", "BARBIL",
        "BARGARH", "BARIPADA", "BERHAMPUR", "BHADRAK", "BHANJANAGAR",
        "BHAWANIPATNA", "BHUBANESWAR", "BRAJRAJNAGAR", "CHHATRAPUR",
        "CUTTACK", "DEOGARH", "DHENKANAL", "GUNUPUR", "HANSPAL",
        "JAGATSINGHPUR", "JAJPUR", "JAJPUR ROAD", "JALESWAR", "JATNI",
        "JEYPORE", "JHARSUGUDA", "JODA", "JUNAGARH", "KENDRAPARA",
        "KEONJHAR", "KHORDHA", "MUNIGUDA", "NABARANGPUR", "NAYAGARH",
        "PARADEEP", "PARALAKHEMUNDI", "PATTAMUNDAI", "PIPILI", "POLASARA",
        "PURI", "RAYAGADA", "ROURKELA", "SAMBALPUR", "SONEPUR", "SORO",
        "SUNDARGARH", "TALCHER", "TITLAGARH",
    ],
    "Pondicherry": ["CUDDALORE", "NAGAPATTINAM", "PONDICHERRY", "THIRUVARUR"],
    "Punjab": [
        "ABOHAR", "AHMEDGARH", "AMRITSAR", "ANANDPUR SAHIB", "BAGHA PURANA",
        "BALACHAUR", "BANGA", "BARNALA", "BATALA", "BATHINDA", "BEAS",
        "CHANDIGARH", "DASUYA", "DERA BASSI", "DHURI", "DINANAGAR",
        "FARIDKOT", "FAZILKA", "FIROZPUR", "GARHSHANKAR", "GIDDERBAHA",
        "GORAYA", "GURDASPUR", "HOSHIARPUR", "JAGRAON", "JALALABAD",
        "JALANDHAR", "KAPURTHALA", "KARTARPUR", "KHANNA", "KHARAR",
        "KOTKAPURA", "LEHRAGAGA", "LUDHIANA", "MALERKOTLA", "MALOUT",
        "MANDI GOBINDGARH", "MANSA", "MOGA", "MOHALI", "MORINDA",
        "MUKERIAN", "MUKTSAR", "NABHA", "NAKODAR", "NANGAL", "NAWANSHAHR",
        "NURPUR BEDI", "PATHANKOT", "PATIALA", "PATRAN", "PATTI",
        "PHAGWARA", "PHILLAUR", "QADIAN", "RAIKOT", "RAJPURA",
        "RAMPURA PHUL", "ROPAR", "SAHNEWAL", "SAMANA", "SAMRALA", "SANGRUR",
        "SHAHKOT", "SIRHIND", "SULTANPUR LODHI", "SUNAM", "TARN TARAN",
        "ZIRA", "ZIRAKPUR",
    ],
    "Rajasthan": [
        "ABU ROAD", "AJMER", "ALWAR", "BAHROD", "BALOTRA", "BANSWARA",
        "BARAN", "BARMER", "BAYANA", "BEAWAR", "BHADRA", "BHARATPUR",
        "BHILWARA", "BHIM", "BHINMAL", "BHIWADI", "BIKANER", "BUNDI",
        "CHITTORGARH", "CHOMU", "CHURU", "DAUSA", "DEOLI", "DHAULPUR",
        "DUNGARGARH", "DUNGARPUR", "FALNA", "FATEHPUR", "GANGANAGAR",
        "GANGAPUR CITY", "HANUMANGARH", "HINDAUN", "JAIPUR", "JAISALMER",
        "JALORE", "JHALAWAR", "JHUNJHUNU", "JODHPUR", "KARAULI", "KEKRI",
        "KISHANGARH", "KOTA", "KOTPUTALI", "KUCHAMAN CITY", "KUKAS",
        "LADNUN", "LALSOT", "MERTA CITY", "MOUNT ABU", "NAGAUR",
        "NAWALGARH", "NEEM KA THANA", "NIMBAHERA", "NIMRANA", "NOHAR",
        "NOKHA", "PALI", "PHALODI", "PRATAPGARH", "RAJSAMAND", "RATANGARH",
        "RAWATSAR", "SAGWARA", "SANGARIA", "SARDARSHAHAR", "SAWAI MADHOPUR",
        "SIKAR", "SIROHI", "SOJAT", "SUJANGARH", "SUMERPUR", "SURATGARH",
        "TONK", "UDAIPUR",
    ],
    "Sikkim": [
        "GANGTOK", "JORETHANG", "NAMCHI", "RAVANGLA", "RONGPO", "SILIGURI",
    ],
    "Tamil Nadu": [
        "ADIRAMPATTINAM", "ALANGULAM", "AMBASAMUDRAM", "AMBUR", "ARAKKONAM",
        "ARANI", "ARANTHANGI", "ARCOT", "ARIYALUR", "ARUPPUKOTTAI", "ATTUR",
        "AVINASHI", "BHAVANI", "BODINAYAKANUR", "CHENGALPATTU", "CHENNAI",
        "CHEYYAR", "CHIDAMBARAM", "COIMBATORE", "COONOOR", "CUMBUM",
        "DEVAKOTTAI", "DHARAPURAM", "DHARMAPURI", "DINDIGUL", "ERODE",
        "GOBICHETTIPALAYAM", "GUDALUR", "GUDIYATHAM", "HOSUR", "JAYANKONDAM",
        "KADAYANALLUR", "KALLAKURICHI", "KANCHIPURAM", "KANGAYAM",
        "KANYAKUMARI", "KARAIKUDI", "KARUR", "KOVILPATTI", "KRISHNAGIRI",
        "KUMBAKONAM", "MADURAI", "MANAPPARAI", "MANNARGUDI", "MAYILADUTHURAI",
        "METTUPALAYAM", "METTUR", "MUSIRI", "NAGERCOIL", "NAMAKKAL",
        "PALACODE", "PALANI", "PALLADAM", "PANRUTI", "PARAMAKUDI",
        "PATTUKOTTAI", "PERAMBALUR", "PERIYAKULAM", "PERUNDURAI", "POLLACHI",
        "PUDUKKOTTAI", "RAJAPALAYAM", "RAMANATHAPURAM", "RANIPET",
        "RASIPURAM", "SALEM", "SANKARANKOVIL", "SANKARI", "SATHYAMANGALAM",
        "SHOLINGHUR", "SIVAGANGA", "SIVAKASI", "SRIVILLIPUTHUR", "SURANDAI",
        "TENKASI", "THANJAVUR", "THENI", "THIRUMANGALAM", "THIRUTHURAIPOONDI",
        "THURAIYUR", "TIRUCHENDUR", "TIRUCHENGODE", "TIRUNELVELI",
        "TIRUPATTUR", "TIRUPPUR", "TIRUTTANI", "TIRUVALLUR", "TRICHY",
        "TUTICORIN", "UDHAGAMANDALAM", "UDUMALAIPETTAI", "USILAMPATTI",
        "VANIYAMBADI", "VELLORE", "VILUPPURAM", "VIRUDHACHALAM", "VIRUDHUNAGAR",
        "WALAJAPET",
    ],
    "Telangana": [
        "ADILABAD", "ARMUR", "BELLAMPALLE", "BHADRACHALAM", "BHAINSA",
        "BHONGIR", "BHUPALPALLY", "BODHAN", "CHEVELLA", "CHOUTUPPAL",
        "DEVARAKONDA", "GADWAL", "GAJWEL", "HASANPARTHY", "HUSNABAD",
        "HUZURABAD", "HUZURNAGAR", "HYDERABAD", "JADCHERLA", "JAGTIAL",
        "JAMMIKUNTA", "JANGAON", "KAGAZNAGAR", "KAMAREDDY", "KARIMNAGAR",
        "KHAMMAM", "KODAD", "KORATLA", "KOTHAGUDEM", "MAHABUBABAD",
        "MAHABUBNAGAR", "MANCHERIAL", "MANDAMARRI", "MEDAK", "METPALLY",
        "MIRYALAGUDA", "NAGARKURNOOL", "NALGONDA", "NARAYANPET", "NIRMAL",
        "NIZAMABAD", "PALWANCHA", "PEDDAPALLI", "RAMAGUNDAM", "SADASHIVPET",
        "SANGAREDDY", "SATHUPALLI", "SHADNAGAR", "SHAMSHABAD", "SIDDIPET",
        "SIRCILLA", "SURYAPET", "TANDUR", "THORRUR", "VEMULAWADA",
        "VIKARABAD", "WANAPARTHY", "WARANGAL", "YELLANDU", "ZAHIRABAD",
    ],
    "Tripura": [
        "AGARTALA", "AMBASSA", "BELONIA", "BISHALGARH", "DHARMANAGAR",
        "KAILASHAHAR", "TELIAMURA", "UDAIPUR",
    ],
    "Uttar Pradesh East": [
        "AKBARPUR", "ALLAHABAD", "AMETHI", "ANPARA", "ATARRA", "AYODHYA",
        "AZAMGARH", "BAHRAICH", "BALLIA", "BALRAMPUR", "BANDA", "BANSI",
        "BARABANKI", "BASTI", "BHADOHI", "BHATNI", "CHANDAULI", "CHHIBRAMAU",
        "CHUNAR", "DEORIA", "DOHRIGHAT", "FAIZABAD", "FARRUKHABAD",
        "FATEHGARH", "FATEHPUR", "GHAZIPUR", "GONDA", "GOPIGANJ",
        "GORAKHPUR", "HAMIRPUR", "HARDOI", "JAGDISHPUR", "JALAUN", "JAUNPUR",
        "JHANSI", "KALPI", "KANNAUJ", "KANPUR", "KANPUR NAGAR", "KAPTANGANJ",
        "KUSHINAGAR", "LAKHIMPUR", "LALGANJ", "LALITPUR", "LUCKNOW",
        "MAHARAJGANJ", "MAHOBA", "MIRZAPUR", "MOHANLALGANJ", "MUGALSARAI",
        "NANPARA", "NAUTANWA", "OBRA", "ORAI", "PADRAUNA", "PALIA KALAN",
        "PRATAPGARH", "PUKHRAYAN", "RAEBARELI", "RASRA", "RATH", "RENUKOOT",
        "SAHJANWA", "SALEMPUR", "SALON", "SANDILA", "SANT KABIRNAGAR",
        "SHAHGANJ", "SHAHJAHANPUR", "SHRAWASTI", "SIDDHARTHNAGAR", "SITAPUR",
        "SONBHADRA", "SULTANPUR", "TALBEHAT", "TANDA", "TULSIPUR", "UNCHAHAR",
        "UNNAO", "UTRAULA", "VARANASI",
    ],
    "Uttar Pradesh West": [
        "AGRA", "ALIGARH", "AMROHA", "AONLA", "ATRAULI", "AURAIYA",
        "BABRALA", "BAGHPAT", "BAHERI", "BAHJOI", "BARAUT", "BAREILLY",
        "BARSANA", "BEHAT", "BEWAR", "BIJNOR", "BISALPUR", "BUDAUN",
        "BULANDSHAHR", "CHANDAUSI", "CHANDPUR", "DAURALA", "DEOBAND",
        "DHAMPUR", "DHANAURA", "DIBIYAPUR", "ETAH", "ETAWAH", "ETMADPUR",
        "FARIDPUR", "FIROZABAD", "GAJRAULA", "GANGOH", "GULAOTHI", "HAPUR",
        "HASTINAPUR", "HATHRAS", "JALESAR", "JANSATH", "JASRANA",
        "JASWANTNAGAR", "JEWAR", "JHANGIRABAD", "KAIRANA", "KANTH", "KARHAL",
        "KASGANJ", "KHATAULI", "KHEKRA", "KHURJA", "KIRATPUR", "KUNDARKI",
        "MAINPURI", "MATHURA", "MAWANA", "MEERUT", "MILAK", "MODINAGAR",
        "MORADABAD", "MURADNAGAR", "MUZAFFARNAGAR", "NAGINA", "NAJIBABAD",
        "NARORA", "NAWABGANJ", "NEHTAUR", "PILIBHIT", "PILKHUWA", "PURANPUR",
        "RAMPUR", "SADABAD", "SAHARANPUR", "SAMBHAL", "SARDHANA", "SARSAWA",
        "SEOHARA", "SHAMLI", "SHAMSABAD", "SHIKARPUR", "SHIKOHABAD",
        "SIKANDRABAD", "SIRSAGANJ", "SIYANA", "TUNDLA", "UJHANI",
    ],
    "Uttarakhand": [
        "ALMORA", "BAGESHWAR", "BANBASA", "BAZPUR", "BHIMTAL", "CHAMPAWAT",
        "DEHRADUN", "GADARPUR", "HALDWANI", "HARIDWAR", "JASPUR",
        "KALADHUNGI", "KASHIPUR", "KATHGODAM", "KHATIMA", "KICHHA",
        "KOTDWAR", "LALKUAN", "LOHAGHAT", "MUSSORIE", "NAINITAL", "PAURI",
        "PITHORAGARH", "RAMNAGAR", "RANIKHET", "RISHIKESH", "ROORKEE",
        "RUDRAPUR", "SITARGANJ", "TANAKPUR", "TEHRI GARHWAL", "UTTARKASHI",
        "VIKAS NAGAR",
    ],
    "West Bengal": [
        "ALIPURDUAR", "AMTA", "ARAMBAG", "ASANSOL", "BAGULA", "BALURGHAT",
        "BANKURA", "BASIRHAT", "BERHAMPORE", "BISHNUPUR", "BOLPUR",
        "BONGAON", "BURDWAN", "CHAKDAHA", "CHANDITALA", "CHAPRA",
        "CHITTARANJAN", "CONTAI", "COOCHBEHAR", "DARJEELING", "DHUPGURI",
        "DIAMOND HARBOUR", "DINHATA", "DUBRAJPUR", "DURGAPUR", "FALAKATA",
        "FARAKKA", "GANGARAMPUR", "GHATAL", "HABRA", "HALDIA", "JAIGAON",
        "JALPAIGURI", "JANGIPUR", "JHARGRAM", "KALIMPONG", "KALIYAGANJ",
        "KANDI", "KARIMPUR", "KATWA", "KHARAGPUR", "KOLAGHAT", "KOLKATA",
        "KRISHNANAGAR", "KULTI", "KURSEONG", "MALBAZAR", "MALDA",
        "MATHABHANGA", "MAYNAGURI", "MEDINIPUR", "MEMARI", "NALHATI",
        "NAXALBARI", "PANDUA", "PANSKURA", "PHULIA", "PLASSEY", "PURULIA",
        "RAIGANJ", "RAMPURHAT", "RANAGHAT", "RANIGANJ", "SANTIPUR",
        "SINGUR", "SONAMUKHI", "SURI", "TAMLUK", "TARAKESWAR", "TUFANGANJ",
    ],
}

SPECIAL_SEARCH = {
    "AURANGABAD_BH":   ("AURANGABAD BIHAR", "Bihar"),
    "JAGDISHPUR_BH":   ("JAGDISHPUR BIHAR", "Bihar"),
    "KHARAGPUR_BH":    ("KHARAGPUR BIHAR", "Bihar"),
    "NOKHA_BH":        ("NOKHA BIHAR", "Bihar"),
    "RANIGANJ_BH":     ("RANIGANJ BIHAR", "Bihar"),
    "ASHTA_MH":        ("ASHTA MAHARASHTRA", "Maharashtra"),
    "BHADRAVATI_MH":   ("BHADRAVATI MAHARASHTRA", "Maharashtra"),
    "KALOL_PANCHMAHAL": ("KALOL PANCHMAHAL GUJARAT", "Gujarat"),
    "MANSA_GJ":        ("MANSA GUJARAT", "Gujarat"),
    "UNA_GJ":          ("UNA GUJARAT", "Gujarat"),
    "ADAMPUR_HR":      ("ADAMPUR HISAR HARYANA", "Haryana"),
    "HASANPUR_HR":     ("HASANPUR HARYANA", "Haryana"),
    "DHARAMPUR_HP":    ("DHARAMPUR HIMACHAL PRADESH", "Himachal Pradesh"),
    "RAMPUR_HP":       ("RAMPUR HIMACHAL PRADESH", "Himachal Pradesh"),
    "RAMGARH_JK":      ("RAMGARH JAMMU KASHMIR", "Jammu And Kashmir"),
    "BISHNUPUR_NE":    ("BISHNUPUR MANIPUR", "Manipur"),
    "FATEHPUR_RJ":     ("FATEHPUR RAJASTHAN", "Rajasthan"),
    "PRATAPGARH_RAJ":  ("PRATAPGARH RAJASTHAN", "Rajasthan"),
    "UDAIPUR_NE":      ("UDAIPUR TRIPURA", "Tripura"),
    "AKBARPUR_AMB":    ("AKBARPUR AMBEDKAR NAGAR", "Uttar Pradesh East"),
    "FATEHPUR_UPE":    ("FATEHPUR UTTAR PRADESH", "Uttar Pradesh East"),
    "RUDRAPUR_UPE":    ("RUDRAPUR UTTAR PRADESH EAST", "Uttar Pradesh East"),
    "AURANGABAD_UP":   ("AURANGABAD UTTAR PRADESH", "Uttar Pradesh West"),
    "FATEHABAD_UPW":   ("FATEHABAD AGRA", "Uttar Pradesh West"),
    "KHARKHODA_UPW":   ("KHARKHODA MEERUT", "Uttar Pradesh West"),
    "SRINAGAR_UPW":    ("SRINAGAR GARHWAL", "Uttarakhand"),
    "HAMIRPUR_UP":     ("HAMIRPUR UTTAR PRADESH", "Uttar Pradesh East"),
}

FALLBACK_COORDS = {
    "Andaman And Nicobar Islands": [11.6234, 92.7265],
    "Andhra Pradesh":    [15.9129, 79.7400],
    "Arunachal Pradesh": [28.2180, 94.7278],
    "Assam":             [26.2006, 92.9376],
    "Bihar":             [25.0961, 85.3131],
    "Chhattisgarh":      [21.2514, 81.6296],
    "Dadra And Nagar Haveli": [20.1809, 73.0169],
    "Goa":               [15.2993, 74.1240],
    "Gujarat":           [22.2587, 71.1924],
    "Haryana":           [29.0588, 76.0856],
    "Himachal Pradesh":  [31.1048, 77.1734],
    "Jammu And Kashmir": [33.7782, 76.5762],
    "Jharkhand":         [23.6102, 85.2799],
    "Karnataka":         [15.3173, 75.7139],
    "Kerala":            [10.8505, 76.2711],
    "Ladakh":            [34.1526, 77.5770],
    "Madhya Pradesh":    [22.9734, 78.6569],
    "Maharashtra":       [19.7515, 75.7139],
    "Manipur":           [24.6637, 93.9063],
    "Meghalaya":         [25.4670, 91.3662],
    "Mizoram":           [23.1645, 92.9376],
    "NCR":               [28.6139, 77.2090],
    "Nagaland":          [26.1584, 94.5624],
    "Orissa":            [20.9517, 85.0985],
    "Pondicherry":       [11.9416, 79.8083],
    "Punjab":            [31.1471, 75.3412],
    "Rajasthan":         [27.0238, 74.2179],
    "Sikkim":            [27.5330, 88.5122],
    "Tamil Nadu":        [11.1271, 78.6569],
    "Telangana":         [17.1232, 79.2088],
    "Tripura":           [23.9408, 91.9882],
    "Uttar Pradesh East": [26.8467, 80.9462],
    "Uttar Pradesh West": [28.7041, 77.1025],
    "Uttarakhand":       [30.0668, 79.0193],
    "West Bengal":       [22.9868, 87.8550],
}


def geocode(city_query: str, state: str) -> list | None:
    params = urllib.parse.urlencode({
        "q": f"{city_query},{state},India",
        "format": "json",
        "limit": "1",
    })
    url = f"{BASE_URL}?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
            if data:
                lat = round(float(data[0]["lat"]), 6)
                lng = round(float(data[0]["lon"]), 6)
                return [lat, lng]
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code}: {city_query}, {state}")
    except urllib.error.URLError as e:
        print(f"  URL error: {city_query}: {e.reason}")
    except Exception as e:
        print(f"  Error: {city_query}: {e}")
    return None


def main():
    # Load existing coords — skip already-known entries
    if os.path.exists(OUTPUT_PATH):
        with open(OUTPUT_PATH) as f:
            results = json.load(f)
        print(f"Loaded {len(results)} existing entries. Skipping those already present.")
    else:
        results = {}

    success = 0
    fallback_used = 0
    skipped = 0
    failed_cities = []

    all_tasks = []
    for key, (query, state) in SPECIAL_SEARCH.items():
        all_tasks.append((key, query, state))
    for state, cities in CITIES.items():
        for city in cities:
            all_tasks.append((city, city, state))

    total = len(all_tasks)
    processed = 0

    for key, query, state in all_tasks:
        processed += 1
        if key in results:
            skipped += 1
            continue

        print(f"[{processed}/{total}] {key} ({state})")
        coords = geocode(query, state)
        if coords:
            results[key] = coords
            success += 1
            print(f"  OK: {coords}")
        else:
            fb = FALLBACK_COORDS.get(state, [0.0, 0.0])
            results[key] = fb
            fallback_used += 1
            failed_cities.append(key)
            print(f"  FALLBACK: {fb}")

        # Save after every city (resumable)
        with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
            json.dump(dict(sorted(results.items())), f, indent=2, ensure_ascii=False)

        time.sleep(1)

    print("\n" + "=" * 60)
    print(f"Done. Total tasks: {total}")
    print(f"  Skipped (already had coords): {skipped}")
    print(f"  Newly geocoded: {success}")
    print(f"  Fallback used: {fallback_used}")
    if failed_cities:
        print(f"\nFallback cities ({len(failed_cities)}):")
        for c in failed_cities:
            print(f"  - {c}")


if __name__ == "__main__":
    main()
