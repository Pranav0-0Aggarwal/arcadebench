import json, math, random, re, sys
from collections import Counter, defaultdict
from datetime import date, time, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from fetch import uci

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "packages/engine/src/games/data"
R = random.Random(11)
pick, chance = R.choice, lambda p: R.random() < p
digits = lambda n: "".join(R.choices("0123456789", k=n))
alnum = lambda n: "".join(R.choices("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", k=n))
mixed = lambda n: "".join(R.choices("abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789", k=n))
slug = lambda s: re.sub(r"[^a-z0-9]", "", s.lower())

TYPES = ["otp", "expense", "income", "bill", "delivery", "alert", "personal", "promo", "spam"]
CATS = ["food", "groceries", "shopping", "transport", "travel", "bills", "entertainment", "health", "transfer", "other"]
QUOTA = dict(zip(CATS, [62, 56, 60, 56, 52, 60, 48, 48, 62, 40]))
UCI_PERSONAL, UCI_SPAM, GEN_SPAM = 340, 230, 230

BANKS = {
    "IN": [(n, s, c, "bank") for n, s, c in [("HDFC Bank", "HDFC", "HDFCBK"), ("ICICI Bank", "ICICI", "ICICIB"), ("State Bank of India", "SBI", "SBIINB"), ("Axis Bank", "Axis", "AXISBK"), ("Kotak Mahindra Bank", "Kotak", "KOTAKB"), ("Bank of Baroda", "BoB", "BOBSMS"), ("Punjab National Bank", "PNB", "PNBSMS"), ("IDFC FIRST Bank", "IDFC FIRST", "IDFCFB"), ("YES BANK", "YES BANK", "YESBNK"), ("Canara Bank", "Canara", "CANBNK"), ("IndusInd Bank", "IndusInd", "INDBNK"), ("Federal Bank", "Federal", "FEDBNK"), ("Union Bank of India", "Union Bank", "UNIONB"), ("RBL Bank", "RBL", "RBLBNK")]],
    "US": [("Chase", "Chase", "Chase", "bank"), ("Bank of America", "BofA", "BofA", "bank"), ("Wells Fargo", "Wells Fargo", "WellsFargo", "bank"), ("Citi", "Citi", "Citi", "bank"), ("Capital One", "Capital One", "CapitalOne", "bank"), ("U.S. Bank", "US Bank", "USBank", "bank"), ("Discover", "Discover", "Discover", "card"), ("American Express", "Amex", "AmEx", "card"), ("PNC Bank", "PNC", "PNC", "bank"), ("TD Bank", "TD Bank", "TDBank", "bank"), ("Ally Bank", "Ally", "Ally", "bank"), ("Citizens Bank", "Citizens", "Citizens", "bank")],
}
ACCT_BANKS = [b for b in BANKS["US"] if b[3] == "bank"]
ACCT = re.compile(r"checking|account ending|acct|deposit|zelle|\batm\b|\bach\b|savings|paycheck|debit|bill pay|loan|autopay", re.I)
APPS = {
    "IN": "Swiggy|Zomato|Amazon|Flipkart|Uber|Ola|Paytm|PhonePe|Myntra|Ajio|Nykaa|BigBasket|Blinkit|Zepto|Airtel|Jio|MakeMyTrip|Dream11|Meesho|CRED|Rapido|Cleartrip|Ixigo|Zerodha|Groww|Slice|Tata Neu|BookMyShow".split("|"),
    "US": "Google|Uber|Lyft|DoorDash|Instagram|Venmo|Cash App|Coinbase|Microsoft|PayPal|Amazon|Uber Eats|Robinhood|Airbnb|Spotify|Netflix|Discord|Snapchat|TikTok|Instacart|Etsy|eBay|Walmart|Target|Zelle".split("|"),
}
MER = {
    "food": {
        "IN": "Swiggy|Zomato|Domino's Pizza|McDonald's|KFC|Burger King|Pizza Hut|Starbucks|Cafe Coffee Day|Haldiram's|Barbeque Nation|Behrouz Biryani|Faasos|EatSure|Chaayos|Subway|Third Wave Coffee|Wow Momo|Sagar Ratna|Theobroma|Truffles|Mainland China|Dunkin'".split("|"),
        "US": "Starbucks|McDonald's|Chipotle|DoorDash|Uber Eats|Grubhub|Domino's|Subway|Panera Bread|Chick-fil-A|Taco Bell|Dunkin'|Wendy's|Shake Shack|Olive Garden|Panda Express|Five Guys|Blue Bottle Coffee|Sweetgreen|Postmates".split("|"),
    },
    "groceries": {
        "IN": "BigBasket|Blinkit|Zepto|DMart|Reliance Fresh|Reliance Smart|More Retail|Nature's Basket|JioMart|Spencer's|Swiggy Instamart|Licious|FreshToHome|Milkbasket|Country Delight|Star Bazaar|Ratnadeep|Easyday".split("|"),
        "US": "Kroger|Safeway|Trader Joe's|Whole Foods|Aldi|Publix|Instacart|Albertsons|H-E-B|Wegmans|Sprouts|Giant Eagle|Food Lion|FreshDirect|Amazon Fresh|Stop & Shop|Meijer|Harris Teeter".split("|"),
    },
    "shopping": {
        "IN": "Amazon|Flipkart|Myntra|Ajio|Nykaa|Meesho|Decathlon|Croma|Reliance Digital|Lenskart|Tata CLiQ|Shoppers Stop|Lifestyle|Pantaloons|Zara|H&M|IKEA|Titan|Westside|Max Fashion|Vijay Sales|Pepperfry|FirstCry|Bata|Puma".split("|"),
        "US": "Amazon|Target|Best Buy|Nike|H&M|Macy's|Nordstrom|Home Depot|IKEA|Apple Store|Etsy|eBay|Old Navy|Sephora|Lowe's|Gap|TJ Maxx|Zara|Wayfair|Uniqlo".split("|"),
    },
    "transport": {
        "IN": "Uber|Ola|Rapido|IndianOil|HPCL|BPCL|Shell|Delhi Metro|Namma Metro|FASTag|BluSmart|Reliance Petrol|Mumbai Metro|ParkPlus|Yulu|Jio-bp|NMMT|Nayara Energy|Hyderabad Metro".split("|"),
        "US": "Uber|Lyft|Shell|Chevron|ExxonMobil|BP|MTA|BART|CTA Ventra|ParkMobile|E-ZPass|SpotHero|Citi Bike|Sunoco|Waymo|Lime|Valero|Marathon|Texaco|Mobil".split("|"),
    },
    "travel": {
        "IN": "IRCTC|IndiGo|Air India|Vistara|SpiceJet|MakeMyTrip|Goibibo|Cleartrip|Yatra|RedBus|OYO|Taj Hotels|Marriott|Airbnb|Booking.com|Ixigo|EaseMyTrip|Akasa Air|Treebo|Agoda|ITC Hotels|Lemon Tree Hotels".split("|"),
        "US": "Delta Air Lines|United Airlines|American Airlines|Southwest Airlines|JetBlue|Marriott|Hilton|Hyatt|Airbnb|Expedia|Booking.com|Amtrak|Greyhound|Hertz|Kayak|Holiday Inn|Alaska Airlines|Spirit Airlines|Avis".split("|"),
    },
    "entertainment": {
        "IN": "Netflix|Spotify|Amazon Prime|Disney+ Hotstar|BookMyShow|PVR Cinemas|INOX|Sony LIV|YouTube Premium|Zee5|Steam|PlayStation Store|Audible|Gaana|JioCinema|Xbox|Wonderla|Apple Music|Nintendo eShop".split("|"),
        "US": "Netflix|Spotify|Hulu|Disney+|AMC Theatres|Steam|PlayStation Network|Xbox|Ticketmaster|YouTube Premium|HBO Max|Apple Music|Audible|Twitch|Regal Cinemas|Live Nation|Peacock|Nintendo eShop|StubHub".split("|"),
    },
    "health": {
        "IN": "Apollo Pharmacy|1mg|PharmEasy|Practo|Netmeds|MedPlus|Lal PathLabs|Thyrocare|Fortis Hospital|Manipal Hospitals|Max Healthcare|Clove Dental|Dr Batra's|Narayana Hospital|Metropolis Labs|Wellness Forever|Cloudnine Hospital".split("|"),
        "US": "CVS Pharmacy|Walgreens|Rite Aid|Quest Diagnostics|LabCorp|Kaiser Permanente|One Medical|Mercy Hospital|GoodRx|Zocdoc|Teladoc|Aspen Dental|LensCrafters|CityMD|Smile Dental|Express Scripts|Planned Parenthood|Mayo Clinic".split("|"),
    },
    "other": {
        "IN": "Urban Company|Naturals Salon|Passport Seva|GiveIndia|Akshaya Patra|DTDC Courier|Blue Dart Courier|Green Trends Salon|Delhi Public School|Laundry Express|e-Challan Traffic Police|CBSE Fee Portal|VLCC|Pet Care Clinic|Gurdwara Seva|Mantra Dry Cleaners".split("|"),
        "US": "USPS|FedEx Office|The UPS Store|DMV|Red Cross|GoFundMe|Great Clips|Dry Cleaners|Springfield Elementary|Notary Public|Salvation Army|United Way|Supercuts|Car Wash Express|Public Storage|City of Austin Parking".split("|"),
    },
}
BILLM = {
    "elec": {"IN": "MSEDCL|BESCOM|Tata Power|Adani Electricity|Torrent Power|TNEB|CESC".split("|"), "US": "PG&E|Con Edison|Duke Energy|National Grid|Xcel Energy|Dominion Energy".split("|")},
    "gas": {"IN": "Mahanagar Gas|Indraprastha Gas|Adani Total Gas|Gujarat Gas".split("|"), "US": "SoCalGas|Piedmont Natural Gas|Atmos Energy|NW Natural".split("|")},
    "water": {"IN": "BWSSB|Delhi Jal Board|Chennai Metrowater|Pune Municipal Corporation".split("|"), "US": "City Water Utilities|Austin Water|Seattle Public Utilities|NYC Water Board".split("|")},
    "telecom": {"IN": "Airtel|Jio|Vi|BSNL".split("|"), "US": "Verizon|AT&T|T-Mobile|Mint Mobile|Visible".split("|")},
    "broadband": {"IN": "ACT Fibernet|Hathway|Airtel Xstream|JioFiber|Tikona".split("|"), "US": "Spectrum|Comcast Xfinity|Cox Communications|Google Fiber|Frontier".split("|")},
    "insurance": {"IN": "LIC|HDFC Life|ICICI Prudential|Star Health Insurance|Max Life Insurance|SBI Life|Bajaj Allianz".split("|"), "US": "Geico|State Farm|Progressive|Allstate|Liberty Mutual|Farmers Insurance".split("|")},
    "dth": {"IN": "Tata Play|Dish TV|Airtel Digital TV|Sun Direct".split("|"), "US": []},
    "rent": {"IN": "NoBroker|CRED RentPay|Housing.com|NestAway".split("|"), "US": "Avalon Apartments|Greystar|Equity Residential|Camden Living|RentCafe".split("|")},
    "card": {"IN": None, "US": None},
    "loan": {"IN": None, "US": None},
}
BILLQ = dict(elec=50, gas=25, water=25, telecom=45, broadband=35, insurance=40, dth=15, rent=25, card=25, loan=15)
PROMOM = {
    "etail": {"IN": "Myntra|Amazon|Flipkart|Nykaa|Ajio|Meesho|Tata CLiQ".split("|"), "US": "Amazon|Etsy|Wayfair|eBay|Chewy".split("|")},
    "store": {"IN": "Lenskart|Decathlon|Croma|Lifestyle|Pantaloons|Reliance Digital".split("|"), "US": "Target|Old Navy|Best Buy|Nike|Macy's|Kohl's|Ulta|Gap|Lowe's|Home Depot|Sephora".split("|")},
    "grocery": {"IN": "BigBasket|Blinkit|Zepto|JioMart".split("|"), "US": "Instacart|Kroger|Whole Foods|Safeway".split("|")},
    "foodapp": {"IN": "Swiggy|Zomato|EatSure".split("|"), "US": "DoorDash|Uber Eats|Grubhub".split("|")},
    "restaurant": {"IN": "Domino's|Pizza Hut|McDonald's|KFC|Burger King|Starbucks|Chaayos".split("|"), "US": "Domino's|Chipotle|Panera Bread|Starbucks|Wendy's|Dunkin'".split("|")},
    "airline": {"IN": "IndiGo|Air India|Vistara|Akasa Air|SpiceJet".split("|"), "US": "Delta Air Lines|Southwest Airlines|JetBlue|United Airlines|Alaska Airlines".split("|")},
    "hotel": {"IN": "Taj Hotels|OYO|Treebo|ITC Hotels|Lemon Tree Hotels".split("|"), "US": "Hilton|Hyatt|Marriott|Holiday Inn|Airbnb".split("|")},
    "ota": {"IN": "MakeMyTrip|Cleartrip|Goibibo|Ixigo|EaseMyTrip|Yatra".split("|"), "US": "Expedia|Booking.com|Kayak|Priceline".split("|")},
    "pharmacy": {"IN": "Apollo Pharmacy|1mg|PharmEasy|Netmeds|MedPlus".split("|"), "US": "CVS Pharmacy|Walgreens|Rite Aid".split("|")},
    "telecom": {"IN": "Airtel|Jio|Vi|BSNL".split("|"), "US": []},
    "bank": {"IN": None, "US": None},
}
PROMOQ = dict(etail=45, store=55, grocery=25, foodapp=30, restaurant=40, airline=20, hotel=20, ota=25, pharmacy=20, telecom=25, bank=25)
ALERTM = {
    "security": {"IN": None, "US": None},
    "bank": {"IN": None, "US": None},
    "hospital": {"IN": "Apollo Hospitals|Fortis Hospital|Max Hospital|Manipal Hospital|Narayana Hospital|Medanta".split("|"), "US": "Mercy Hospital|Kaiser Permanente|Cleveland Clinic|Johns Hopkins Medicine|NYU Langone|Banner Health".split("|")},
    "clinic": {"IN": "Apollo Clinic|Aster Clinic|Cloudnine Clinic|Practo Care Clinic".split("|"), "US": "One Medical|CityMD|MinuteClinic|Summit Health".split("|")},
    "dental": {"IN": "Clove Dental|Smile Studio Dental|Dentzz|Axiss Dental".split("|"), "US": "Aspen Dental|Smile Dental|Gentle Dental|Bright Now Dental".split("|")},
    "garage": {"IN": "Maruti Suzuki Service|Hyundai Service Centre|Tata Motors Service|Mahindra First Choice".split("|"), "US": "Jiffy Lube|Midas|Pep Boys|Toyota Service|Honda Service".split("|")},
    "airline": PROMOM["airline"],
    "train": {"IN": ["IRCTC", "Indian Railways"], "US": ["Amtrak"]},
    "hotel": PROMOM["hotel"],
    "telecom": {"IN": "Airtel|Jio|Vi|BSNL".split("|"), "US": "Verizon|AT&T|T-Mobile".split("|")},
}
ALERTQ = dict(security=65, bank=55, payfail=35, hospital=25, clinic=25, dental=20, garage=15, airline=35, train=15, hotel=20, telecom=10)
DELM = {
    "etail": {"IN": "Amazon|Flipkart|Myntra|Ajio|Nykaa|Meesho|Croma|Decathlon|Lenskart|Tata CLiQ|FirstCry|Pepperfry|Reliance Digital".split("|"), "US": "Amazon|Target|Walmart|Best Buy|Nike|Etsy|Wayfair|Home Depot|Sephora|Chewy|Apple".split("|")},
    "food": {"IN": "Swiggy|Zomato|Domino's|EatSure|Faasos".split("|"), "US": "DoorDash|Uber Eats|Grubhub|Domino's".split("|")},
    "grocery": {"IN": "BigBasket|Blinkit|Zepto|Swiggy Instamart|JioMart".split("|"), "US": "Instacart|Amazon Fresh|Kroger|Whole Foods".split("|")},
}
DELQ = dict(etail=190, food=55, grocery=55)
SHOPS = {
    "IN": "Swiggy|Zomato|Myntra|Amazon|Flipkart|Nykaa|BigBasket|Domino's|Ajio|MakeMyTrip|Lenskart|Decathlon|Croma|Pizza Hut|Lifestyle|Meesho|Tata CLiQ|Starbucks".split("|"),
    "US": "Target|Old Navy|Sephora|Uber|Domino's|CVS|Best Buy|Nike|Starbucks|Lyft|Macy's|Kohl's|Chipotle|Panera Bread|Ulta|Gap|DoorDash|Walgreens|Wendy's|Lowe's".split("|"),
}
ALERTM["payfail"] = SHOPS
PEOPLE = {
    "IN": ("Rahul Priya Amit Neha Ankit Sneha Vikram Pooja Rohan Anjali Suresh Kavita Arjun Divya Manish Ritu Karan Meera Nikhil Swati Aditya Isha Varun Shreya".split(), "Sharma Verma Gupta Singh Patel Nair Reddy Iyer Khan Das Mehta Joshi Kumar Rao Banerjee Chopra Malhotra Menon Shah Bose".split()),
    "US": ("Emily Jacob Olivia Michael Sarah David Jessica Daniel Ashley Chris Megan Brandon Taylor Justin Lauren Ryan Hannah Tyler Nicole Kevin".split(), "Smith Johnson Williams Brown Davis Miller Wilson Moore Taylor Anderson Thomas Garcia Martinez Lee Walker Hall Young King Wright".split()),
}
CITIES = {"IN": "Mumbai Bengaluru Delhi Hyderabad Pune Chennai Kolkata Ahmedabad Jaipur Kochi Chandigarh Lucknow".split(), "US": "Austin Seattle Chicago Denver Boston Atlanta Phoenix Portland Miami Dallas Brooklyn Oakland".split()}
HANDLES = "okaxis okhdfcbank oksbi okicici ybl ibl axl paytm upi apl icici hdfcbank sbi".split()
CORPS = {"IN": "ACME TECHNOLOGIES PVT LTD|INFOSYS LTD|TCS LTD|WIPRO LTD|ZOHO CORP|CAPGEMINI INDIA|HCL TECHNOLOGIES|ACCENTURE SOLUTIONS|TECH MAHINDRA|COGNIZANT TECH|DELOITTE USI|FRESHWORKS INC".split("|"), "US": "ACME CORP|GOOGLE LLC|AMAZON.COM SVCS|WALMART INC|TARGET CORP|KAISER FOUNDATION|CITY OF AUSTIN|DELL TECHNOLOGIES|ORACLE AMERICA|STRIPE INC|SALESFORCE INC|MICROSOFT CORP".split("|")}
DEVICES = ["Chrome on Windows", "Safari on iPhone", "an Android device", "Edge on Windows", "Firefox on Mac", "an iPad", "Samsung Galaxy S23", "a new device"]
COURIER = {"IN": ["Delhivery", "Blue Dart", "Ecom Express", "DTDC", "Xpressbees", "Shadowfax", "Ekart"], "US": ["UPS", "FedEx", "USPS", "DHL"]}
RANGE = {
    "IN": dict(elec=(300, 6000), gas=(300, 2500), water=(80, 900), telecom=(199, 1999), broadband=(400, 2500), insurance=(1500, 45000), dth=(150, 1000), rent=(6000, 60000), loan=(2000, 40000), food=(90, 1800), groceries=(120, 4500), shopping=(299, 25000), transport=(30, 2500), travel=(800, 35000), bills=(199, 9000), entertainment=(99, 1500), health=(80, 6000), transfer=(100, 20000), other=(200, 15000)),
    "US": dict(loan=(150, 900), elec=(40, 300), gas=(20, 200), water=(20, 120), telecom=(30, 150), broadband=(30, 120), insurance=(60, 400), rent=(700, 3200), food=(5, 85), groceries=(12, 260), shopping=(15, 480), transport=(4, 90), travel=(80, 1400), bills=(25, 320), entertainment=(6, 120), health=(8, 400), transfer=(10, 900), other=(10, 300)),
}
OPS = "AD AX BK BP BZ CP DM HP JD JK JM LM TD TM TX VA VK VM".split()
TLDS = "top xyz vip click info cc co online site icu link in".split()
MEMOS = ["Thanks!", "for last night", "see you soon", "got it", "split", "as promised", "2 weeks ago", "weekend trip", "thank you", "no rush"]


def indian(c, v):
    s = f"{v:.2f}" if c["dec"] else str(round(v))
    w, _, f = s.partition(".")
    if c["commas"] and len(w) > 3:
        w = re.sub(r"(\d)(?=(\d\d)+$)", r"\1,", w[:-3]) + "," + w[-3:]
    return w + ("." + f if f else "")


def fmt(c, v):
    s = indian(c, v) if c["region"] == "IN" else (f"{v:,.2f}" if c["commas"] else f"{v:.2f}")
    return c["cur"].format(s)


def amount(c):
    lo, hi = RANGE[c["region"]].get(c.get("cat"), (50, 5000) if c["region"] == "IN" else (10, 300))
    v = math.exp(R.uniform(math.log(lo), math.log(hi)))
    return float(round(v)) if c["region"] == "IN" and chance(.65) else round(v, 2)


def when(c, k=0):
    return (c["d"] + timedelta(days=k)).strftime(c["dfmt"])


def phone(region):
    return pick([f"+91 {pick('6789')}{digits(4)} {digits(5)}", f"+91{pick('6789')}{digits(9)}", f"0{pick('6789')}{digits(9)}", f"{pick('6789')}{digits(9)}"]) if region == "IN" else pick([f"+1 ({digits(3)}) 555-{digits(4)}", f"+1{digits(10)}", f"{digits(3)}-{digits(3)}-{digits(4)}"])


def person(region):
    f, l = PEOPLE[region]
    return f"{pick(f)} {pick(l)}"


def bad(w):
    return pick(["http://", "https://", "", ""]) + pick([f"{w}-kyc-update.{pick(TLDS)}/{mixed(5)}", f"{w}-secure-login.{pick(TLDS)}", f"bit.ly/{mixed(7)}", f"tinyurl.com/{mixed(8).lower()}", f"cutt.ly/{mixed(6)}", f"{w}{digits(2)}.{pick(TLDS)}/{mixed(4)}", f"{w}-verify.{pick(TLDS)}/{mixed(6)}", f"update-{w}.{pick(TLDS)}", f"{w}-support.{pick(TLDS)}/{digits(4)}"])


def order(c):
    s = slug(c["m"])
    if s == "amazon":
        return f"{digits(3)}-{digits(7)}-{digits(7)}"
    if s in ("flipkart", "myntra", "ajio"):
        return pick([f"OD{digits(18)}", f"FMPC{digits(10)}"])
    return pick([f"ORD{digits(8)}", f"#{digits(6)}", alnum(8), f"{alnum(2)}{digits(8)}"])


def spoof(c):
    if c["region"] == "US":
        return pick([digits(5), digits(6), phone("US")])
    code = pick(["KYCUPD", "ALERTS", "OFFERS", "NOTIFY", "UPDATES", "CLAIMS", "INFOSM", "SECURE"])
    return f"{pick(OPS)}-{code}" + pick(["", "-S", "-T"])


def good(c):
    s = slug(c.get("brand") or c.get("air") or c.get("hotel") or c["m"])[:10] or "app"
    return pick([f"https://{s}.com/{mixed(5)}", f"{s}.in/{mixed(6)}" if c["region"] == "IN" else f"{s}.com/{mixed(6)}", f"https://{s[:4]}.to/{mixed(5)}", f"https://www.{s}.com/track", f"bit.ly/{mixed(7)}" if chance(.2) else f"https://{s}.com/a/{mixed(4)}"])


def sender(kind, c):
    region = c["region"]
    if kind == "numx":
        return phone(region) if chance(.5) else spoof(c)
    if kind == "mx" and chance(.15):
        return digits(6)
    kind = "m" if kind == "mx" else kind
    if kind == "spoof":
        return spoof(c)
    if kind == "num":
        return phone(region)
    name = c["b"][2] if kind == "bank" else c[kind] if kind in GEN else kind
    if region == "IN":
        code = re.sub(r"[^A-Za-z]", "", name).upper()[:6]
        return pick([f"{pick(OPS)}-{code}", f"{pick(OPS)}-{code}", code]) + pick(["", "", "-S", "-T"])
    return pick([name, name.replace(" ", ""), digits(5), digits(6)])


GEN = {
    "b": lambda c: pick(BANKS[c["region"]]),
    "bank": lambda c: c["b"][0],
    "bk": lambda c: c["b"][1],
    "bankurl": lambda c: slug(c["b"][1]) + ".com/alerts",
    "bankoffer": lambda c: slug(c["b"][1]) + ".com/" + pick(["offers", "apply", "rewards"]),
    "dpurl": lambda c: f"{slug(c['dp'])}.com/track/{mixed(6)}",
    "last4": lambda c: digits(4),
    "acct": lambda c: pick(["XX", "xx", "X", "*", "XXXX", "**", "XXXXXXXX"]) + c["last4"],
    "cur": lambda c: pick(["Rs.{}", "Rs {}", "Rs{}", "INR {}", "INR{}", "₹{}", "₹ {}", "Rs.{}/-"]) if c["region"] == "IN" else pick(["${}", "${}", "${}", "USD {}", "USD{}"]),
    "commas": lambda c: chance(.7),
    "dec": lambda c: chance(.55),
    "araw": amount,
    "amt": lambda c: fmt(c, c["araw"]),
    "amt2": lambda c: fmt(c, round(c["araw"] * R.uniform(.04, .3), 2)),
    "bal": lambda c: fmt(c, round(math.exp(R.uniform(math.log(1500 if c["region"] == "IN" else 150), math.log(400000 if c["region"] == "IN" else 9000))), 2)),
    "d": lambda c: date(2024, 1, 1) + timedelta(days=R.randint(0, 540)),
    "dfmt": lambda c: pick(["%d-%b-%y", "%d/%m/%y", "%d-%m-%Y", "%d%b%y", "%d %b %Y", "%d-%b-%Y", "%d/%m/%Y"]) if c["region"] == "IN" else pick(["%m/%d/%Y", "%m/%d", "%b %d", "%B %d, %Y", "%m/%d/%y", "%b %d, %Y"]),
    "date": lambda c: when(c),
    "date2": lambda c: when(c, R.randint(2, 25)),
    "mon": lambda c: c["d"].strftime(pick(["%b-%Y", "%B", "%b %Y"])),
    "t": lambda c: time(R.randint(7, 22), R.randint(0, 59), R.randint(0, 59)),
    "tfmt": lambda c: pick(["%H:%M", "%I:%M %p", "%H:%M"]) if c["region"] == "IN" else pick(["%I:%M %p", "%I:%M%p"]),
    "time": lambda c: c["t"].strftime(c["tfmt"]),
    "time2": lambda c: time(min(c["t"].hour + 2, 23), c["t"].minute).strftime(c["tfmt"]),
    "ref": lambda c: str(R.randint(3, 5)) + digits(11),
    "utr": lambda c: pick(["SBIN", "HDFC", "ICIC", "UTIB"]) + digits(12),
    "txn": lambda c: "T" + digits(16),
    "conf": lambda c: alnum(8),
    "oid": order,
    "awb": lambda c: pick([f"1Z{alnum(16)}", f"9400{digits(18)}", f"{digits(12)}"]) if c["region"] == "US" else pick([f"DEL{digits(9)}", digits(12), f"SF{digits(12)}", f"{alnum(2)}{digits(10)}"]),
    "pnr": lambda c: digits(10),
    "tno": lambda c: digits(5),
    "fno": lambda c: str(R.randint(101, 9899)),
    "gate": lambda c: pick("ABCDE") + str(R.randint(1, 40)),
    "pf": lambda c: R.randint(1, 12),
    "cno": lambda c: digits(10),
    "pol": lambda c: digits(9),
    "mob": lambda c: pick("6789") + digits(9),
    "pts": lambda c: R.randint(2, 480),
    "atm": lambda c: pick(["SBI", "HDFC", "ICICI", "AXIS", "PNB"]) + digits(7),
    "otp": lambda c: digits(pick([4, 4, 5, 6, 6, 6, 6, 6, 6, 6, 8])),
    "otp6": lambda c: digits(6),
    "otpd": lambda c: f"{digits(3)}-{digits(3)}",
    "hash": lambda c: mixed(11),
    "mins": lambda c: pick([3, 5, 10, 15, 30]),
    "pct": lambda c: pick([10, 15, 20, 25, 30, 40, 50, 60, 70]),
    "code": lambda c: pick(["SAVE", "WELCOME", "FIRST", "BIG", "FEAST", "DEAL", "GOLD", "FLAT", "NEW", "EXTRA", "HAPPY", "MEGA"]) + str(pick([10, 15, 20, 25, 30, 50, 100, 150])),
    "gb": lambda c: pick([1, 1.5, 2, 3]),
    "days": lambda c: pick([28, 56, 84]),
    "n": lambda c: R.randint(8, 45),
    "sal": lambda c: fmt(c, float(R.randrange(25000, 250000, 500)) if c["region"] == "IN" else float(R.randrange(1200, 6500, 5))),
    "cb": lambda c: fmt(c, float(R.randint(5, 500)) if c["region"] == "IN" else float(R.randint(1, 60))),
    "due": lambda c: fmt(c, float(R.randint(1500, 90000)) if c["region"] == "IN" else float(R.randint(80, 4500))),
    "dmin": lambda c: fmt(c, float(R.randint(100, 4500)) if c["region"] == "IN" else float(R.randint(25, 140))),
    "cap": lambda c: fmt(c, float(pick([50, 75, 100, 120, 150, 200, 250])) if c["region"] == "IN" else float(pick([5, 10, 15, 20, 25]))),
    "fare": lambda c: fmt(c, float(pick([1499, 1999, 2499, 2999, 3499])) if c["region"] == "IN" else float(pick([39, 59, 79, 99, 129]))),
    "cap2": lambda c: fmt(c, float(pick([50, 100, 150])) if c["region"] == "IN" else float(pick([5, 10, 20]))),
    "thr": lambda c: fmt(c, float(pick([199, 299, 399, 499, 999])) if c["region"] == "IN" else float(pick([25, 35, 50, 75, 99]))),
    "loan": lambda c: pick(["Rs 2,00,000", "Rs 5,00,000", "Rs 10,00,000", "Rs 15,00,000", "Rs 25 Lakhs"]),
    "bonus": lambda c: pick(["$100", "$150", "$200", "$250", "$300", "$500", "$750"]),
    "person": lambda c: person(c["region"]),
    "payee": lambda c: payee(c["person"]),
    "tag": lambda c: mixed(R.randint(5, 9)).lower(),
    "memo": lambda c: pick(MEMOS),
    "city": lambda c: pick(CITIES[c["region"]]),
    "device": lambda c: pick(DEVICES),
    "dp": lambda c: pick(COURIER[c["region"]]),
    "locker": lambda c: pick(["Amazon Hub", "Delhivery Pickup", "Blue Dart Point", "Cloud Locker"]) if c["region"] == "IN" else pick(["Amazon Locker", "UPS Access Point", "FedEx Pickup", "Walgreens Locker"]),
    "pcode": lambda c: pick([digits(4), digits(6), alnum(6)]),
    "corp": lambda c: pick(CORPS[c["region"]]),
    "brand": lambda c: pick(APPS[c["region"]]),
    "m": lambda c: pick(SHOPS[c["region"]]),
    "mn": lambda c: c["m"],
    "url": good,
    "badurl": lambda c: bad(slug(c["b"][1])),
    "badgen": lambda c: bad(pick(["kyc", "update", "secure", "verify", "claim", "rewards", "offer", "refund", "pay", "gov"])),
    "helpline": lambda c: f"1800 {digits(4)} {digits(4)}" if c["region"] == "IN" else f"1-800-{digits(3)}-{digits(4)}",
    "short": lambda c: "9" + digits(9) if c["region"] == "IN" else digits(5),
    "scam": lambda c: phone(c["region"]) if c["region"] == "IN" else f"1-8{pick(['00', '33', '44', '55', '66', '77', '88'])}-{digits(3)}-{digits(4)}",
    "lakh": lambda c: pick(["Rs 25,00,000", "Rs 10,00,000", "Rs 50,00,000", "Rs 8,50,000", "INR 25 Lakhs", "Rs.1,00,00,000"]),
    "ref6": lambda c: digits(6),
    "handle": lambda c: "@" + mixed(7).lower(),
    "lotto": lambda c: pick(["KBC", "Jio", "Flipkart", "Amazon", "Airtel", "Paytm"]),
    "flat": lambda c: f"{pick('ABCD')}-{R.randint(101, 1204)}",
}
for w in "usps toll netflix irs apple amazon dmv coinbase walmart chase fedex verizon paypal cashapp studentaid".split():
    GEN["bad_" + w] = lambda c, w=w: bad(w)


class Ctx(dict):
    def __missing__(self, k):
        v = self[k] = GEN[k](self)
        return v


def T(text, region="IN", snd="bank", hard=False, cats=None, dom=None):
    return dict(text=text, region=region, snd=snd, hard=hard, cats=cats, dom=dom)


ALL = "*"
K = lambda s: tuple(s.split())

OTP = [
    T("{otp} is the OTP for txn of {amt} at {m} on {bank} Card {acct}. Valid for {mins} mins. Do not share it with anyone."),
    T("OTP for your {bank} NetBanking login is {otp}. Valid for {mins} minutes. Never share your OTP with anyone. -{bk}"),
    T("<#> {otp} is your {brand} verification code. {hash}", "ANY", "brand"),
    T("Your {brand} OTP is {otp}. Do not share it with anyone.", "ANY", "brand"),
    T("{otp} is your one time password (OTP) to proceed on {brand}. DO NOT SHARE this with anyone, {brand} never asks for it.", "IN", "brand"),
    T("Use {otp} as OTP to log in to your {brand} account. Valid for {mins} mins.", "IN", "brand"),
    T("Dear Customer, OTP for registering your mobile number for UPI is {otp}. Valid for {mins} mins. Do not share. -{bk}"),
    T("OTP to add beneficiary {person} is {otp}. Do not share this OTP with anyone. -{bank}"),
    T("Your Aadhaar OTP is {otp}. It is valid for 10 minutes. Do not share it with anyone. -UIDAI", "IN", "UIDAI"),
    T("{otp} is your OTP for IRCTC login. Valid for {mins} minutes. Do not share.", "IN", "IRCTC"),
    T("OTP for e-Filing portal login is {otp}. Valid for 15 mins. -ITD", "IN", "ITDEFO"),
    T("Your DigiLocker verification code is {otp}. Do not share it. -MeitY", "IN", "DGLOCK"),
    T("{otp} is your OTP for EPF member portal login. Never share it. -EPFO", "IN", "EPFOHO"),
    T("Your verification code: {otp}", "ANY", "brand"),
    T("Enter {otp} to verify your number.", "ANY", "brand"),
    T("{otp} is the OTP for your payment of {amt} to {m}. Valid for {mins} mins."),
    T("Your Paytm OTP is {otp}. Never share your OTP with anyone, Paytm never calls to ask for it.", "IN", "Paytm"),
    T("Your {brand} verification code is: {otp}", "US", "brand"),
    T("{otp} is your {brand} security code. Don't share it with anyone.", "US", "brand"),
    T("G-{otp6} is your Google verification code.", "US", "Google"),
    T("Your {bank} security code is {otp}. Do not share this code with anyone. We will never call or text you to ask for it.", "US"),
    T("Your WhatsApp code: {otpd} You can also tap on this link to verify your phone: v.whatsapp.com/{otp6}", "ANY", "WhatsApp"),
    T("Use code {otp} to verify your phone number. Msg&data rates may apply. Reply STOP to opt out.", "US", "brand"),
    T("Your one-time passcode is {otp}. It expires in {mins} minutes. -{bank}", "US"),
    T("{brand} login code: {otp}. Valid for {mins} minutes.", "US", "brand"),
    T("[{brand}] {otp} is your verification code", "ANY", "brand"),
    T("DO NOT SHARE: {otp} is your {brand} one-time code. If you didn't request this, ignore this message.", "US", "brand"),
    T("Your Apple ID Code is: {otp}. Don't share it with anyone.", "US", "Apple"),
    T("Use {otp} as Microsoft account security code", "US", "Microsoft"),
    T("{bank}: Use code {otp} to confirm your {amt} payment to {m}. Don't share this code.", "US"),
    T("Dear Customer, {otp} is your OTP for transaction of {amt} at {m}. Valid for {mins} min. Do not share this with anyone. -{bk}"),
    T("OTP {otp} for login to {bank} mobile banking. Valid for {mins} mins. If not requested by you, call {helpline}."),
    T("Your one time password for {brand} is {otp}. It is valid for {mins} minutes. Please do not share it.", "IN", "brand"),
    T("{otp} is your {brand} OTP. Never share your OTP, {brand} will never ask you for it.", "IN", "brand"),
    T("Use {otp} to verify your {brand} account. This code expires in {mins} minutes.", "ANY", "brand"),
    T("Your {brand} code is {otp}. It expires in {mins} minutes.", "US", "brand"),
    T("{brand}: {otp} is your one-time login code. Don't share it with anyone. We'll never ask for it.", "US", "brand"),
    T("<#> Your {brand} OTP is {otp} {hash}", "IN", "brand"),
    T("{otp} is the OTP to reset your {bank} UPI PIN. Valid for {mins} mins. Do not share it with anyone. -{bk}"),
    T("{brand} verification: enter {otp} to confirm your phone number.", "US", "brand"),
]

EXPENSE = [
    T("{amt} debited from A/c {acct} on {date} and credited to {payee} (UPI Ref No {ref}). If not you, call {helpline}.", cats=ALL),
    T("Sent {amt} From {bank} A/C {acct} To {m} On {date} Ref No {ref} Not You? Call {helpline}", cats=ALL),
    T("UPI txn of {amt} to {m} successful. Ref {ref}. Bal {bal} -{bk}", cats=ALL),
    T("{bank}: Card {acct} used for {amt} at {m} on {date}. Avl limit {bal}. Not you? SMS BLOCK {last4} to {short}"),
    T("Dear Customer, {amt} has been spent on your {bank} Credit Card ending {last4} at {m} on {date}. Total Avl Limit: {bal}."),
    T("Txn of {amt} done on {bk} Debit Card {acct} at {m}. Available balance {bal}. {date} {time}"),
    T("Dear UPI user A/C {acct} debited by {amt} on date {date} trf to {m} Refno {ref}. If not u? call {helpline} -{bk}", cats=ALL),
    T("{bank} Acct {acct} debited for {amt} on {date}; {payee} credited. UPI:{ref}. Call {helpline} for dispute. SMS BLOCK {last4} to {short}.", cats=ALL),
    T("{amt} debited from A/c no. {acct} on {date} {time} IST. Info: UPI/P2M/{ref}/{m}. If not you, call {helpline}. -{bk}"),
    T("{amt} debited from A/c no. {acct} on {date} {time} IST. Info: UPI/P2A/{ref}/{m}. If not you, call {helpline}. -{bk}", cats=K("transfer")),
    T("Paid {amt} to {m} using Paytm UPI. Txn ID {txn}. Wallet balance {bal}.", snd="Paytm", cats=ALL),
    T("{amt} paid to {m} from your Paytm Wallet. Balance {bal}. Order ID {oid}.", snd="Paytm"),
    T("You paid {amt} to {m} using Amazon Pay balance. Remaining balance: {bal}.", snd="AmazonPay"),
    T("You bought from {m} for {amt} using LazyPay. Pay by {date2} to avoid late fee. Txn {txn}", snd="LazyPay", cats=K("food groceries shopping entertainment health travel")),
    T("Your {m} subscription of {amt} has been auto-debited from {bank} Card {acct} on {date}. Manage at {url}", cats=K("entertainment bills"), dom=K("telecom broadband dth insurance")),
    T("E-mandate: {amt} debited for {m} from A/c {acct} on {date}. Ref {ref}", cats=K("entertainment bills health")),
    T("{amt} withdrawn from A/c {acct} at ATM {atm} on {date} {time}. Avl Bal {bal}. -{bk}", cats=K("other")),
    T("Cash withdrawal of {amt} at {atm} ATM using {bk} Card {acct}. Avl bal {bal}.", cats=K("other")),
    T("Thank you for using {bank} Card {acct} for {amt} at {m} on {date}. Reward points earned: {pts}"),
    T("{amt} paid to {m} via NetBanking from {bank} A/c {acct} on {date}. Txn Ref {ref}.", cats=ALL),
    T("IMPS: {amt} sent to {m} ({payee}) from A/c {acct}. Ref {ref}. {date} {time}. -{bk}", cats=K("transfer")),
    T("NEFT of {amt} to {m} initiated from A/c {acct} on {date}. UTR {utr}. -{bank}", cats=K("transfer")),
    T("You have sent {amt} to {m} via PhonePe. UPI Ref {ref}. Debited from {bank} {acct}.", snd="PhonePe", cats=K("transfer")),
    T("{amt} sent to {m} on {date}. UPI Ref {ref}. Bal {bal}. -{bk}", cats=K("transfer")),
    T("Paid {amt} to {m}. Money sent from {bank} A/c {acct}. UPI Ref No. {ref}", cats=K("transfer")),
    T("Payment of {amt} to {m} for consumer no. {cno} is successful. Txn {txn}. Thank you.", snd="m", cats=K("bills"), dom=K("elec gas water telecom broadband dth")),
    T("Bill payment of {amt} to {m} received. Ref {cno}. Txn {txn}. Thank you.", snd="m", cats=K("bills")),
    T("Payment of {due} received on your {bank} Credit Card ending {last4} on {date}. Thank you.", hard=True, cats=K("bills")),
    T("{due} debited from A/c {acct} towards {bank} Credit Card bill payment on {date}. Ref {ref}.", hard=True, cats=K("bills")),
    T("Credit card payment: {due} paid via UPI to {bank} Credit Card {acct}. Txn {ref}.", hard=True, cats=K("bills")),
    T("Thank you for your payment of {due} towards {bank} Credit Card {acct}. Your available credit limit is now {bal}.", hard=True, cats=K("bills")),
    T("{bank}: We received your payment of {due} on {date}. Thank you! Your card ending {last4} is up to date.", "US", hard=True, cats=K("bills")),
    T("Your payment of {due} to your {bank} credit card was successful. Confirmation #{conf}.", "US", hard=True, cats=K("bills")),
    T("Your ACH payment of {amt} to {m} was processed on {date}. Confirmation {conf}.", "US", cats=K("bills")),
    T("AutoPay: {amt} paid to {m} from account ending {last4}.", "US", cats=K("bills")),
    T("Payment of {amt} to {m} successful. Confirmation #{conf}. Thank you for paying on time.", "US", snd="m", cats=K("bills")),
    T("{bank}: Bill pay of {amt} to {m} was sent from checking ending {last4} on {date}.", "US", cats=K("bills")),
    T("{bank}: You made a {amt} transaction with your card ending in {last4} at {m} on {date}.", "US"),
    T("{bank} Alert: Your debit card ending in {last4} was used for {amt} at {m}.", "US"),
    T("{bank}: Debit card purchase {amt} at {m} on {date}. Avail bal: {bal}. Reply HELP for help.", "US"),
    T("{bank}: A purchase of {amt} was made at {m} on card ending in {last4}.", "US"),
    T("{bank} Alert: A {amt} transaction was made at {m} on card ending in {last4}. View details at {bankurl}", "US"),
    T("{bank}: A {amt} purchase was charged at {m} on {date} on your card ending in {last4}.", "US"),
    T("Charge alert: {amt} at {m} on {date}. Card ending {last4}. Reply STOP to opt out.", "US"),
    T("PayPal: You sent a payment of {amt} USD to {m}. Transaction ID {txn}.", "US", "PayPal"),
    T("Zelle: You sent {amt} to {m}. Confirmation #{conf}.", "US", cats=K("transfer")),
    T("Venmo: You paid {m} {amt}. {memo}", "US", "Venmo", cats=K("transfer")),
    T("Cash App: You sent {amt} to ${tag}.", "US", "CashApp", cats=K("transfer")),
    T("PayPal: You sent {amt} USD to {m}.", "US", "PayPal", cats=K("transfer")),
    T("{bank}: Zelle payment of {amt} to {m} was sent from account ending {last4}.", "US", cats=K("transfer")),
    T("{bank}: ATM withdrawal of {amt} on {date}. Available balance {bal}.", "US", cats=K("other")),
]

INCOME = [
    T("Dear Customer, A/c {acct} credited with {sal} on {date} by NEFT-{corp}. Avl Bal {bal}. -{bk}"),
    T("{amt} credited to your A/c {acct} on {date} by UPI from {person} ({payee}). UPI Ref {ref}. -{bk}", hard=True),
    T("Your salary of {sal} has been credited to {bank} A/c {acct} on {date}. Avl Bal {bal}"),
    T("IMPS credit {amt} received in A/c {acct} from {person}. Ref {ref}.", hard=True),
    T("{bank} Acct {acct} credited with {sal} on {date}. Info: NEFT-{corp}. Available Bal: {bal}"),
    T("Your A/C {acct} Credited {amt} on {date} -Deposit by transfer from {person}. Avl Bal {bal}", hard=True),
    T("Refund of {amt} for order {oid} has been credited to your {bank} A/c {acct}. Ref {ref}. -{m}", snd="m", hard=True),
    T("Your refund of {amt} has been credited to your {m} wallet. Order {oid}. Balance {bal}.", snd="m", hard=True),
    T("Cashback of {cb} credited to your Paytm wallet for your transaction at {m}. Balance {bal}", snd="Paytm", hard=True),
    T("{bank}: A credit of {amt} has posted to your card ending {last4} on {date}. Merchant: {m} (refund).", "US", hard=True),
    T("Your txn of {amt} on {date} to {m} has failed. {amt} has been credited back to A/c {acct}. Ref {ref}", hard=True),
    T("Interest of {cb} has been credited to your A/c {acct} for the quarter ending {date}. -{bk}"),
    T("Dividend of {amt} credited to your A/c {acct} by {corp} on {date}. -{bk}"),
    T("{amt} deposited in A/c {acct} at {bk} CDM on {date}. Avl Bal {bal}."),
    T("Received {amt} from {person} in your Paytm account. Txn ID {txn}.", snd="Paytm", hard=True),
    T("Cashback of {cb} has been credited to your {bank} Credit Card statement for spends at {m}.", hard=True),
    T("Rent received: {amt} credited to A/c {acct} on {date} from {person}. Ref {ref}. -{bk}"),
    T("Reversal of {amt} for failed UPI txn to {m} credited to A/c {acct} on {date}. Ref {ref}. -{bk}", hard=True),
    T("Direct deposit of {sal} from {corp} posted to your account ending {last4}.", "US"),
    T("Zelle: {person} sent you {amt}. Funds were deposited into your account ending {last4}.", "US", hard=True),
    T("Venmo: {person} paid you {amt}. {memo}", "US", "Venmo", hard=True),
    T("Cash App: {person} sent you {amt}.", "US", "CashApp", hard=True),
    T("PayPal: You received {amt} USD from {person}.", "US", "PayPal", hard=True),
    T("{bank}: A deposit of {amt} posted to account ending {last4} on {date}.", "US"),
    T("{bank}: Deposit {amt} to checking acct {last4}. Avail bal {bal}", "US"),
    T("{bank}: Deposit {amt} from IRS TREAS 310 TAX REF posted to account ending {last4}.", "US"),
    T("{m}: A refund of {amt} has been credited to your card ending {last4} for order {oid}.", "US", "m", hard=True),
    T("{bank}: Statement credit of {cb} applied to your card ending {last4} for your cash back rewards.", "US", hard=True),
    T("{bank}: Interest paid {cb} to savings ending {last4} this month.", "US"),
    T("Your paycheck deposit of {sal} from {corp} is now available in account ending {last4}.", "US"),
    T("Your EPF claim of {amt} has been settled to A/c {acct}. UTR {utr}. -{bk}"),
    T("Tax refund of {amt} has been credited to your A/c {acct} by CPC on {date}. -{bk}"),
    T("Your reimbursement of {amt} from {corp} has been credited to A/c {acct} on {date}. Ref {ref}."),
    T("Maturity proceeds of {amt} for your FD have been credited to A/c {acct} on {date}. -{bk}"),
    T("Mutual fund redemption of {amt} has been credited to your A/c {acct} on {date}. -{bk}"),
    T("{bank}: Your check deposit of {amt} has been accepted and posted to account ending {last4}.", "US"),
    T("{bank}: Cash back reward of {cb} was deposited to your account ending {last4}.", "US", hard=True),
    T("PayPal: {person} sent you {amt} USD. The funds are now in your PayPal balance.", "US", "PayPal", hard=True),
]

BILL = [
    T("Dear Customer, your {m} electricity bill of {amt} for {mon} is generated. Due date: {date2}. Pay on {url} to avoid late fee. Consumer No {cno}", snd="m", cats=K("elec")),
    T("Your {m} electricity bill for {mon} is {amt}. Last date to pay without penalty: {date2}. Pay via {url}", snd="m", cats=K("elec")),
    T("{m}: Your electricity bill for consumer no. {cno} is overdue. Pay {amt} before {date2} to avoid disconnection. {url}", "IN", "m", cats=K("elec")),
    T("{m}: Your bill is ready. Amount due {amt} by {date2}. Pay at {url}", "US", "m", cats=K("elec telecom broadband gas")),
    T("{m}: Your {mon} statement is ready. Balance {amt}, due {date2}. View statement at {url}", "US", "m", cats=K("elec water broadband telecom gas")),
    T("{m}: Your {mon} energy usage was higher than last month. Your bill of {amt} is due {date2}. Details: {url}", "US", "m", cats=K("elec gas")),
    T("Gas bill generated: {amt} for consumer {cno}, due {date2}. Pay online at {url}. -{m}", snd="m", cats=K("gas")),
    T("Your {m} PNG bill of {amt} for {mon} is due on {date2}. Pay now: {url}", "IN", "m", cats=K("gas")),
    T("Your water bill {amt} for the period {mon} is ready. Due by {date2}. -{m}", snd="m", cats=K("water")),
    T("{m}: Water charges of {amt} are pending for consumer {cno}. Pay by {date2} at {url}", "IN", "m", cats=K("water")),
    T("Reminder: Your {m} postpaid bill of {amt} is due on {date2}. Pay now on the {m} app to avoid service interruption.", snd="m", cats=K("telecom")),
    T("Your {m} Postpaid bill for {mon} is {amt}. Bill date {date}. Due date {date2}. View: {url}", snd="m", cats=K("telecom")),
    T("{m}: Your {mon} bill of {amt} has been generated for {mob}. Pay by {date2} to avoid late charges. {url}", "IN", "m", cats=K("telecom")),
    T("Your {m} broadband bill {amt} is due on {date2}. Pay at {url}. Ignore if paid.", snd="m", cats=K("broadband")),
    T("{m}: Your broadband plan renews on {date2}. Pay {amt} to avoid interruption: {url}", "IN", "m", cats=K("broadband")),
    T("{m}: Your internet bill of {amt} is ready. AutoPay will draft it on {date2}. Details: {url}", "US", "m", cats=K("broadband")),
    T("{m}: Invoice {oid} for your broadband plan is ready. Amount {amt}, due {date2}. Pay: {url}", "IN", "m", cats=K("broadband")),
    T("Your {m} premium of {amt} for Policy No {pol} is due on {date2}. Pay online or at branch. Ignore if already paid.", snd="m", cats=K("insurance")),
    T("{m}: Your policy {pol} premium of {amt} is due on {date2}. Pay now to keep your cover active: {url}", "IN", "m", cats=K("insurance")),
    T("{m} Reminder: your premium of {amt} is due on {date2}. Pay online or call {helpline}.", "US", "m", cats=K("insurance")),
    T("Your {m} auto policy payment of {amt} is due {date2}. Avoid a lapse in coverage: {url}", "US", "m", cats=K("insurance")),
    T("Your {m} account balance is low. Recharge with {amt} by {date2} to keep watching.", snd="m", cats=K("dth")),
    T("{m}: Your DTH recharge of {amt} is due. Pay by {date2} to avoid disconnection: {url}", "IN", "m", cats=K("dth")),
    T("Hi, rent of {amt} for flat {flat} is due on {date2}. Pay securely via {m}: {url}", snd="m", cats=K("rent")),
    T("{m}: Your rent reminder: {amt} is due on {date2}. Pay on time through the app to earn rewards. {url}", "IN", "m", cats=K("rent")),
    T("Reminder: Rent of {amt} is due on the 1st. Pay through your resident portal. -{m}", "US", "m", cats=K("rent")),
    T("Hi {person}, your rent payment of {amt} is due {date2}. Pay at {url}", "US", "m", cats=K("rent")),
    T("Your AutoPay of {amt} to {m} is scheduled for {date2}. Make sure your account has enough funds.", "US", "m", cats=K("elec telecom broadband insurance gas water rent")),
    T("Overdue: Your {m} bill of {amt} was due on {date}. Pay now to avoid a late fee: {url}", "ANY", "m", cats=K("telecom broadband")),
    T("Your {bank} Credit Card statement for {mon}: Total amount due {due}, Minimum due {dmin}, Due date {date2}. Pay via UPI/NetBanking. -{bk}", hard=True, cats=K("card")),
    T("{due} is due on your {bank} Credit Card ending {last4} by {date2}. Pay now to avoid late payment charges.", hard=True, cats=K("card")),
    T("{bank} Credit Card payment reminder: Total due {due} by {date2}. Ignore if already paid.", hard=True, cats=K("card")),
    T("{bank}: Payment reminder. Your minimum payment of {dmin} for card ending {last4} is due {date2}.", "US", hard=True, cats=K("card")),
    T("{bank} Credit Card: Your statement balance of {due} is due {date2}. Minimum payment {dmin}.", "US", hard=True, cats=K("card")),
    T("{bank}: Your {mon} statement is ready. Pay {due} by {date2} to avoid interest. View it at {bankurl}", "US", hard=True, cats=K("card")),
    T("Dear Customer, EMI of {amt} for your {bank} loan A/c {acct} is due on {date2}. Please maintain sufficient balance.", cats=K("loan")),
    T("{bank}: Your loan instalment of {amt} is due on {date2}. Pay in the app to avoid a late fee.", "IN", cats=K("loan")),
    T("{bank}: Your auto loan payment of {amt} is due {date2}. Pay at {bankurl}", "US", cats=K("loan")),
]

ALERT = [
    T("Alert: New login to your {brand} account from {device} in {city} at {time}. If this wasn't you, reset your password at {url}", "ANY", "brand", cats=K("security")),
    T("{brand}: We noticed a sign-in to your account from a new device ({device}). If this was you, no action is needed.", "ANY", "brand", cats=K("security")),
    T("Security alert: your {brand} password was changed. If you didn't make this change, secure your account at {url}", "ANY", "brand", cats=K("security")),
    T("{brand}: Someone tried to sign in to your account from {city}. We blocked the attempt. Review activity: {url}", "ANY", "brand", cats=K("security")),
    T("Your {brand} recovery email was changed on {date}. If this wasn't you, contact support: {url}", "ANY", "brand", cats=K("security")),
    T("{brand} security notice: two-step verification was turned off on your account. Turn it back on at {url}", "ANY", "brand", cats=K("security")),
    T("New device linked to your {brand} account on {date} ({device}). Not you? Sign out of all devices: {url}", "ANY", "brand", cats=K("security")),
    T("Your {brand} account was accessed from {city} on {date} at {time}. If this wasn't you, change your password now: {url}", "ANY", "brand", cats=K("security")),
    T("Your {bank} NetBanking password was changed on {date} at {time}. If you did not do this, call {helpline} immediately. -{bk}", cats=K("bank")),
    T("Your {bank} Debit Card {acct} has been temporarily blocked after 3 incorrect PIN attempts. Visit a branch or call {helpline}.", cats=K("bank")),
    T("{bank}: Your mobile banking was registered on a new device on {date}. Not you? Call {helpline} now.", "ANY", cats=K("bank")),
    T("{bank}: Your debit card ending {last4} expires next month. A new card has been mailed to your address on file.", "US", cats=K("bank")),
    T("Low balance alert: your {bank} A/c {acct} balance is {bal} as on {date}. Please maintain the minimum balance.", hard=True, cats=K("bank")),
    T("{bank}: Your card ending {last4} was temporarily locked after several failed attempts. Call {helpline} to unlock it.", "US", cats=K("bank")),
    T("{bank}: Your UPI PIN was changed on {date}. If this wasn't you, call {helpline} now.", "IN", cats=K("bank")),
    T("{bank}: Your online banking password was changed on {date}. If this wasn't you, call {helpline} right away.", "US", cats=K("bank")),
    T("Dear Customer, your {bank} credit card ending {last4} has been blocked on your request. A new card will be dispatched in 7 days.", "IN", cats=K("bank")),
    T("Your payment of {amt} to {m} on {date} could not be completed. No amount has been debited from A/c {acct}. Please try again.", hard=True, cats=K("payfail")),
    T("Transaction declined: {amt} at {m} on card ending {last4}. Reason: insufficient funds.", "US", hard=True, cats=K("payfail")),
    T("UPI transaction of {amt} to {payee} failed due to a technical issue. If debited, the amount will be refunded within 3-5 working days. -{bk}", hard=True, cats=K("payfail")),
    T("{bank}: Your {amt} payment to {m} was declined. Call {helpline} if you need assistance.", "US", hard=True, cats=K("payfail")),
    T("{bank}: Your autopay of {amt} to {m} failed due to insufficient balance in A/c {acct}. Please add funds by {date2}.", "IN", hard=True, cats=K("payfail")),
    T("{bank}: Your payment of {amt} to {m} could not be processed. The funds were not withdrawn from your account ending {last4}.", "US", hard=True, cats=K("payfail")),
    T("Reminder: You have an appointment with Dr. {person} at {m} on {date2} at {time}. Reply C to confirm or R to reschedule.", "ANY", "m", cats=K("hospital clinic")),
    T("Appointment reminder: {m} tomorrow at {time}. Reply YES to confirm or call {helpline} to reschedule.", "ANY", "m", cats=K("hospital clinic")),
    T("{m}: Your vaccination slot is on {date2} at {time}. Carry a photo ID.", "ANY", "m", cats=K("hospital clinic")),
    T("{m}: Your lab test is scheduled for {date2} at {time}. Please fast for 10 hours before the sample.", "ANY", "m", cats=K("hospital clinic")),
    T("{m}: Your follow-up consultation with Dr. {person} is booked for {date2}, {time}. Please carry your previous reports.", "ANY", "m", cats=K("hospital clinic")),
    T("{m}: Dr. {person} is running 30 minutes late for your {time} appointment on {date}. We apologise for the delay.", "ANY", "m", cats=K("hospital clinic")),
    T("Your dental appointment is confirmed for {date2} at {time}. Please arrive 10 minutes early. -{m}", "ANY", "m", cats=K("dental")),
    T("{m}: Reminder: your cleaning appointment is on {date2} at {time}. Reply C to confirm.", "ANY", "m", cats=K("dental")),
    T("{m}: Your check-up with Dr. {person} is on {date2} at {time}. Call {helpline} to reschedule.", "ANY", "m", cats=K("dental")),
    T("Service reminder: Your car service at {m} is scheduled for {date2}, {time}. Pick-up will be arranged.", "ANY", "m", cats=K("garage")),
    T("{m}: Your car is ready for pick-up. Please collect it before 7 PM today. Job card {conf}.", "ANY", "m", cats=K("garage")),
    T("{m}: Your vehicle is due for its periodic service on {date2}. Book a slot at {url}", "ANY", "m", cats=K("garage")),
    T("{m}: Flight {fno} on {date2} is delayed. New departure time {time}. We regret the inconvenience.", "ANY", "m", cats=K("airline")),
    T("{m}: Gate change for flight {fno}: now departing from gate {gate}. Boarding begins {time}.", "ANY", "m", cats=K("airline")),
    T("{m}: Check-in is now open for your flight {fno} to {city} on {date2}. Check in at {url}", "ANY", "m", cats=K("airline")),
    T("{m}: Your flight {fno} to {city} on {date2} has been rescheduled to depart at {time}. Check your booking for details. {url}", "ANY", "m", cats=K("airline")),
    T("{m}: Your flight {fno} has been cancelled due to weather. Rebook at {url}.", "ANY", "m", cats=K("airline")),
    T("{m}: Flight {fno} is now boarding at gate {gate}. Please proceed to the gate.", "ANY", "m", cats=K("airline")),
    T("{m}: Train {tno} platform changed. Now arriving at platform {pf}. PNR {pnr}", "IN", "m", cats=K("train")),
    T("{m}: Your train {tno} is cancelled. Refund will be processed automatically. PNR {pnr}.", "IN", "m", cats=K("train")),
    T("{m}: Train {tno} is running late by {n} minutes. New departure time {time}.", "ANY", "m", cats=K("train")),
    T("{m}: Chart prepared for train {tno}. Your seat status is confirmed. PNR {pnr}.", "IN", "m", cats=K("train")),
    T("{m}: Your train {tno} departure has moved to track {pf}. Boarding begins {time}.", "US", "m", cats=K("train")),
    T("{m}: Your booking {conf} check-in time is {time} on {date2}. Early check-in is not available.", "ANY", "m", cats=K("hotel")),
    T("{m}: Check-in instructions for your stay on {date2}: bring a photo ID and your booking reference {conf}.", "ANY", "m", cats=K("hotel")),
    T("{m}: Your room for {date2} has been upgraded. Check-in starts at {time}. Show booking {conf} at reception.", "ANY", "m", cats=K("hotel")),
    T("{m}: Your SIM card details were updated on {date}. If you did not request this, call {helpline}.", "IN", "m", cats=K("telecom")),
    T("{m}: A SIM swap request was received for your number on {date}. If this wasn't you, call {helpline} immediately.", "ANY", "m", cats=K("telecom")),
    T("{m}: A new device was added to your account on {date}. If this wasn't you, sign in at {url} to review.", "US", "m", cats=K("telecom")),
]

DELIVERY = [
    T("Your {m} order {oid} is out for delivery today. Track: {url}", "ANY", "m", cats=K("etail")),
    T("Delivered: Your {m} package {oid} was delivered on {date} at {time}. Rate your experience: {url}", "ANY", "m", cats=K("etail")),
    T("{m}: Your order {oid} is delayed. New delivery date {date2}. We apologise for the inconvenience.", "ANY", "m", cats=K("etail")),
    T("Hi, your parcel {awb} from {m} will be delivered today between {time} and {time2}. Delivery partner: {dp} {mob}", "IN", "dp", cats=K("etail")),
    T("Your {m} order will be delivered today. Please keep {amt} ready as cash on delivery (COD). {url}", "IN", "m", True, K("etail")),
    T("Pay {amt} to the delivery agent via UPI/cash on delivery for order {oid}. -{m}", "IN", "m", True, K("etail")),
    T("We tried delivering {awb} but nobody was available. Next attempt on {date2}. Reschedule: {dpurl} -{dp}", "IN", "dp", cats=K("etail")),
    T("Your parcel is ready for pickup at {locker}. Pickup code: {pcode}. Collect within 3 days.", "IN", "locker", True, K("etail")),
    T("Your order {oid} has been shipped via {dp}. AWB {awb}. Expected delivery {date2}. Track at {url}", "ANY", "m", cats=K("etail")),
    T("India Post: Article {awb} delivered to {person} at {city} on {date}.", "IN", "INDPST", cats=K("etail")),
    T("Your {m} order {oid} will reach you by {time}. Please be available to receive it.", "ANY", "m", cats=K("etail")),
    T("Hi {person}, your {m} courier {awb} could not be delivered. Please keep your phone reachable for the next attempt on {date2}.", "IN", "dp", cats=K("etail")),
    T("{m}: Your return pickup is scheduled for {date2} between {time} and {time2}. Please keep the item packed with the original tags.", "ANY", "m", cats=K("etail")),
    T("Your {m} order {oid} has been dispatched and will arrive by {date2}.", "ANY", "m", cats=K("etail")),
    T("{m}: Delivery update: your order {oid} has been rescheduled to {date2} as requested.", "ANY", "m", cats=K("etail")),
    T("Your {m} order {oid} has reached the {city} hub and will be out for delivery soon.", "ANY", "m", cats=K("etail")),
    T("{m}: Your package {awb} is out for delivery today.", "US", "m", cats=K("etail")),
    T("{dp}: Your package from {m} is scheduled for delivery {date2}. Track: {dpurl}", "US", "dp", cats=K("etail")),
    T("{dp}: Delivery exception: your shipment {awb} was delayed. New estimated delivery {date2}.", "US", "dp", cats=K("etail")),
    T("{m}: Your order {oid} has shipped! Track it here: {url}", "US", "m", cats=K("etail")),
    T("{m}: Your order was delivered. Enjoy! Rate your delivery: {url}", "US", "m", cats=K("etail")),
    T("Your package was delivered. It was left near your front door or porch. -{m}", "US", "m", cats=K("etail")),
    T("Package ready for pickup at {locker}. Use code {pcode} within 3 days.", "US", "locker", True, K("etail")),
    T("Your {m} order {oid} was delivered to the front desk at {time}.", "US", "m", cats=K("etail")),
    T("{dp}: Your package from {m} will arrive today between {time} and {time2}. Track: {dpurl}", "US", "dp", cats=K("etail")),
    T("Your {m} order {oid} is on the way! {person} is delivering it, ETA {n} mins.", "ANY", "m", cats=K("food")),
    T("{m}: Order delivered! Enjoy your meal. Rate order {oid}: {url}", "ANY", "m", cats=K("food")),
    T("{m}: Your order is delayed by {n} mins. Sorry for the wait, we are on it.", "ANY", "m", cats=K("food")),
    T("Your {m} delivery partner {person} has reached your location. Share handover code {pcode} with them.", "ANY", "m", True, K("food")),
    T("{m}: Please pay {amt} in cash to your delivery partner on arrival. Order {oid}.", "IN", "m", True, K("food")),
    T("Your {m} order {oid} has been picked up from the restaurant and will reach you in {n} mins.", "ANY", "m", cats=K("food")),
    T("{m}: Your delivery driver {person} is on the way with your groceries. ETA {time}.", "ANY", "m", cats=K("grocery")),
    T("Your {m} order {oid} will be delivered between {time} and {time2} today.", "ANY", "m", cats=K("grocery")),
    T("{m}: A few items in your order {oid} were replaced as they were out of stock. Delivery by {time}.", "ANY", "m", cats=K("grocery")),
    T("{m}: Delivered! Your groceries have arrived. Please refrigerate perishables promptly. Order {oid}.", "ANY", "m", cats=K("grocery")),
    T("Your {m} order {oid} is arriving in {n} mins. Your delivery partner {person} is on the way. Share handover code {pcode} with them.", "IN", "m", True, K("grocery")),
    T("{m}: Your delivery slot is {date2}, {time} to {time2}. Someone should be home to receive it.", "ANY", "m", cats=K("grocery")),
]

PROMO = [
    T("{m}: Flat {pct}% OFF on your next order! Use code {code} at checkout. Valid till {date2}. T&C apply. {url}", "ANY", "mx", True, K("etail store grocery foodapp restaurant")),
    T("{m} sale is LIVE! Up to {pct}% off on top brands. Shop now: {url}", "ANY", "mx", False, K("etail store")),
    T("{m}: You left something in your cart! Complete your purchase and get free shipping. {url}", "ANY", "mx", False, K("etail store")),
    T("Still thinking it over? The items in your {m} cart are selling fast. Checkout: {url}", "ANY", "mx", False, K("etail store")),
    T("Hi {person}, your {m} cart misses you. Complete your order today: {url}", "ANY", "mx", False, K("etail store")),
    T("Price drop on an item in your cart at {m}! Complete your purchase: {url}", "ANY", "mx", False, K("etail store")),
    T("Hungry? Get {pct}% off up to {cap} on your next order with {code}. Order now {url}", "IN", "mx", False, K("foodapp restaurant")),
    T("{bank}: Pre-approved offer! Get a Personal Loan up to {loan} at attractive rates. Apply instantly on the app. T&C apply.", "IN", "bank", False, K("bank")),
    T("{bank}: Get a pre-approved credit card with zero joining fee. Apply at {bankoffer}. T&C apply.", "IN", "bank", False, K("bank")),
    T("Recharge with {amt} and get {gb}GB/day for {days} days. Recharge now on the {m} app. T&C apply.", "IN", "mx", False, K("telecom")),
    T("{m}: Unlimited 5G data and calls with the {amt} plan. Recharge now at {url}. T&C apply.", "IN", "mx", False, K("telecom")),
    T("Dear Customer, your {m} plan expires on {date2}. Renew now with {amt} and get a streaming subscription free for 3 months. {url}", "IN", "mx", False, K("telecom")),
    T("Switch to {m} postpaid and get free data rollover and a free SIM at your doorstep. Visit {url} or call {helpline}.", "IN", "mx", False, K("telecom")),
    T("{m} Prepaid: Get extra {gb}GB data on your recharge of {amt} using code {code}. Limited period offer.", "IN", "mx", True, K("telecom")),
    T("Dear Customer, convert your {bank} Credit Card purchase of {amt} to EMI at 0% for 6 months. Visit {bankoffer}. T&C apply.", "IN", "bank", False, K("bank")),
    T("{m} members: Free delivery on all orders above {thr}. Use code {code}. T&C apply.", "ANY", "mx", True, K("etail store grocery foodapp pharmacy")),
    T("Verify your number and get {cap} off your first order! Use code {code} at checkout. Never share your OTP with anyone.", "IN", "mx", True, K("etail grocery foodapp restaurant")),
    T("Don't miss out! Use code {code} to save {pct}%. Shop with {bank} Card and enjoy instant discount. Your OTP is for you only, never share it. T&C apply.", "ANY", "bank", True, K("bank")),
    T("Pay faster with {m}: no OTP needed for orders up to {thr} with one-tap checkout. Turn it on in the app: {url}", "ANY", "mx", True, K("etail grocery foodapp")),
    T("Your referral code {code} is ready. Share it with friends: they get {cap} off and you earn {cap2}. {url}", "ANY", "mx", True, K("etail grocery foodapp ota")),
    T("Use code {code} for {pct}% off at {m}. Code valid till {date2}.", "ANY", "mx", True, K("etail store grocery foodapp restaurant airline hotel ota pharmacy")),
    T("Get 5X reward points on dining this weekend. Enter code {code} while paying with your {bank} Card. T&C apply.", "IN", "bank", True, K("bank")),
    T("{m}: {pct}% off everything today only! Use code {code} online or show this text in store. Reply STOP to opt out.", "US", "mx", True, K("store restaurant")),
    T("Your {m} reward: {cb} in rewards expires {date2}. Redeem now: {url}. Msg&data rates may apply. Reply STOP to end.", "US", "mx", False, K("store restaurant pharmacy")),
    T("Early access: Save {pct}% on your next order with code {code}. Shop now {url}. Txt STOP to opt out", "US", "mx", True, K("etail store")),
    T("{m}: Get {cap} off your next order with code {code}. Valid for 7 days.", "US", "mx", True, K("foodapp restaurant etail grocery")),
    T("{bank}: You're pre-approved for a {bank} credit card with a {bonus} welcome bonus. Apply at {bankoffer}. Reply STOP to opt out.", "US", "bank", False, K("bank")),
    T("{bank}: Earn 3% cash back on dining this quarter. Activate now at {bankoffer}. Reply STOP to opt out.", "US", "bank", False, K("bank")),
    T("{m}: Flash sale! Free shipping on orders over {thr}. No code needed. Ends tonight. {url}", "US", "mx", False, K("etail store")),
    T("Exclusive for you: {pct}% off at {m} when you pay with {bank}. Offer valid till {date2}. T&C apply.", "ANY", "bank", False, K("store restaurant ota hotel")),
    T("Fresh offers at {m}! Buy 1 Get 1 on selected items this weekend. Show this message at the store. T&C apply.", "ANY", "mx", False, K("store restaurant")),
    T("{m}: Your wishlist item is now {pct}% off. Grab it before {date2}: {url}", "ANY", "mx", False, K("etail store")),
    T("Fly with {m}: fares from {fare}* one way. Book by {date2}: {url}", "ANY", "mx", False, K("airline ota")),
    T("Book now with {m} and save {pct}% on flights. Use code {code}. Valid till {date2}. {url}", "ANY", "mx", True, K("airline ota")),
    T("{m}: Seats are filling fast on routes to {city}. Book now and save {pct}%: {url}", "ANY", "mx", False, K("airline")),
    T("Weekend getaway! Up to {pct}% off on hotels with {m}. Book now: {url}", "ANY", "mx", False, K("hotel ota")),
    T("{m}: Book 2 nights, get the 3rd free. Offer valid till {date2}. T&C apply. {url}", "ANY", "mx", False, K("hotel")),
    T("Planning a trip? Members save {pct}% at {m} this season. Book direct: {url}", "ANY", "mx", False, K("hotel")),
    T("Hotels in {city} from {fare} a night on {m}. Book now: {url}", "ANY", "mx", False, K("ota")),
    T("{m}: Get {pct}% off on medicines and health products this week. Order now: {url}", "ANY", "mx", False, K("pharmacy")),
    T("{m}: Refill and save! Use code {code} for {cap} off your next order.", "ANY", "mx", True, K("pharmacy")),
    T("{m}: Your {cap} off coupon expires {date2}. Show this text at checkout.", "US", "mx", False, K("pharmacy")),
    T("{m}: Fresh fruits and veggies at up to {pct}% off today. Order now: {url}", "ANY", "mx", False, K("grocery")),
    T("{m}: Free delivery on your first 3 orders. Use code {code}. Order now {url}", "ANY", "mx", True, K("grocery")),
    T("{m}: Craving something? Free delivery on orders over {thr} tonight. {url}", "ANY", "mx", False, K("foodapp")),
    T("{m}: 3 months of free membership is waiting for you! Activate: {url}", "ANY", "mx", False, K("foodapp")),
    T("{m}: Buy one, get one free on selected items today only. Order via the app: {url}", "ANY", "mx", False, K("restaurant")),
    T("{m} Rewards: You're {n} points away from a free item. Order today and earn double points. {url}", "ANY", "mx", False, K("restaurant")),
    T("{m}: End of season sale! Flat {pct}% off storewide till {date2}. Visit your nearest store or shop online: {url}", "ANY", "mx", False, K("store")),
]

SPAM = [
    T("Dear {bank} customer, your account will be BLOCKED today. Update your KYC/PAN immediately: {badurl}", snd="numx", hard=True),
    T("{bk}: Your KYC is pending. Your account will be suspended in 24 hrs. Click {badurl} to update now", snd="spoof", hard=True),
    T("Dear Customer, {amt} debited from your A/c XX{last4} on {date} for online purchase of iPhone. If not you call {scam} immediately", snd="spoof", hard=True),
    T("Congratulations! You have won {lakh} in the {lotto} Lucky Draw. To claim your prize WhatsApp {scam} now. Ref {ref6}", snd="numx"),
    T("Dear user, your {bank} reward points worth {amt} will expire today. Redeem now: {badurl}", snd="spoof", hard=True),
    T("URGENT: Your electricity connection will be disconnected tonight at 9:30 PM because your previous month bill is not updated. Contact electricity officer {scam} immediately", snd="numx"),
    T("Earn {amt} daily working from home! Just like and subscribe to YouTube videos. Message HI on WhatsApp {scam}", snd="numx"),
    T("Your parcel is on hold due to incomplete address. Pay a small redelivery fee at {badgen} to release it.", hard=True, snd="numx"),
    T("Dear Customer, your PAN card is blocked and Aadhaar suspended. Update details at {badgen} or your SIM will be deactivated", snd="numx"),
    T("Tax refund of {amt} approved by the IT Department. Verify your bank details at {badgen} to receive it.", hard=True, snd="numx"),
    T("Get instant loan up to {lakh} without documents! 5 minutes approval. Download app: {badgen}. Limited offer", snd="numx"),
    T("Your {bank} Net Banking account has been locked due to invalid attempts. Unlock it now {badurl}", hard=True, snd="spoof"),
    T("Dear {person}, a UPI collect request of {amt} is pending. Accept to receive cashback {badgen}", snd="numx"),
    T("Join our VIP stock market group. Guaranteed 300% returns, daily tips by SEBI expert. WhatsApp {scam}", snd="numx"),
    T("You are selected for a work from home job at Amazon. Salary {amt}/day. Contact HR on Telegram {handle}", snd="numx"),
    T("Your SIM will be blocked in 2 hours. Complete mandatory KYC at {badgen}", snd="numx"),
    T("Lucky draw: your mobile number won an iPhone 15 from {lotto}. Claim at {badgen} before midnight", snd="numx"),
    T("Dear customer, your {bank} debit card has been deactivated due to incomplete KYC. Call {scam} to reactivate it today.", snd="spoof", hard=True),
    T("Congratulations! Your number has been selected for a free {lotto} 5G recharge of {amt}. Claim here: {badgen}", snd="numx"),
    T("Part time job: earn {amt} per day by rating products online. No investment. Contact us on WhatsApp {scam}", snd="numx"),
    T("Your gas subsidy refund of {amt} is pending. Update your bank details at {badgen} to receive it today.", snd="numx"),
    T("{bank}: Your account debit failed. Update your PAN within 24 hours to avoid blocking: {badurl}", snd="spoof", hard=True),
    T("We found your Aadhaar linked to illegal activity. Call {scam} immediately to avoid arrest.", snd="numx"),
    T("Hi Mom, I lost my phone and this is my new number. Please send {amt} to this account urgently, I will explain later.", snd="num", hard=True),
    T("Dear customer, your credit limit has been increased to {lakh}! Click {badgen} to activate. Offer expires tonight.", snd="spoof", hard=True),
    T("Final reminder: pay your pending traffic challan of {amt} at {badgen} to avoid court action.", snd="numx"),
    T("USPS: Your package could not be delivered due to an incomplete address. Update your address at {bad_usps} within 12 hours to avoid return.", "US", hard=True, snd="numx"),
    T("You have an unpaid toll balance of {amt}. Pay now to avoid additional fees: {bad_toll}", "US", snd="numx"),
    T("{bank} Fraud Alert: A transaction of {amt} was attempted on your card. If not you, verify at {badurl}", "US", hard=True, snd="spoof"),
    T("Netflix: Your payment failed. Update your billing information at {bad_netflix} or your account will be suspended", "US", hard=True, snd="numx"),
    T("IRS: You are eligible for a tax refund of {amt}. Claim it here: {bad_irs}", "US", snd="numx"),
    T("Hi, is this {person}? I got your number from a friend, we met at the conference last month. Sorry if I have the wrong number.", "US", snd="num"),
    T("Congratulations! You've been selected to receive a $1000 Walmart gift card. Claim now: {bad_walmart}", "US", snd="numx"),
    T("Your Apple ID has been locked for security reasons. Verify your identity: {bad_apple}", "US", hard=True, snd="numx"),
    T("Amazon: Your order of an iPhone 15 Pro ({amt}) has been placed. If this wasn't you, call {scam} to cancel.", "US", hard=True, snd="numx"),
    T("Final notice: your vehicle warranty is about to expire. Call {scam} to renew", "US", snd="num"),
    T("URGENT: Your {bank} account is on hold. Restore access at {badurl}", "US", hard=True, snd="spoof"),
    T("Earn $500-$900 per day from home. Reply YES for details. Text STOP to end", "US", snd="numx"),
    T("Coinbase: Unauthorized withdrawal of 0.45 BTC. If not you, cancel here: {bad_coinbase}", "US", hard=True, snd="numx"),
    T("Your Social Security number has been suspended due to suspicious activity. Call {scam}", "US", snd="num"),
    T("DMV final notice: unpaid traffic ticket {amt}. Pay now to avoid license suspension {bad_dmv}", "US", snd="numx"),
    T("FedEx: your parcel is held at the depot. Confirm delivery and pay the $1.99 fee at {bad_fedex}", "US", hard=True, snd="numx"),
    T("{bank}: Zelle payment of {amt} to {person} is pending. If you did not authorize it, cancel now: {badurl}", "US", hard=True, snd="spoof"),
    T("Hi {person}, I'm a recruiter with a remote job opening paying $300 an hour. Message me on WhatsApp {scam}", "US", snd="num"),
    T("Cash App: you have a pending deposit of {amt}. Claim it within 24 hours: {bad_cashapp}", "US", hard=True, snd="numx"),
    T("Verizon: Your bill is overdue. Pay now to avoid disconnection: {bad_verizon}", "US", hard=True, snd="numx"),
    T("Student loan forgiveness: you qualify for {amt} in relief. Apply before the deadline: {bad_studentaid}", "US", snd="numx"),
    T("PayPal: Your account has been limited. Confirm your identity to restore access: {bad_paypal}", "US", hard=True, snd="numx"),
    T("Your Amazon account was locked after a suspicious order. Call {scam} to verify and unlock it.", "US", hard=True, snd="numx"),
    T("Invest in crypto with our expert team. Triple your money in 30 days. Message us on Telegram {handle}", "US", snd="numx"),
    T("Medicare: your card must be replaced. Confirm your details with an agent at {scam} to avoid losing coverage.", "US", snd="numx"),
]

HAM_BAD = re.compile(r"\b(slave|punish|lick|mouth|spank|naughty|boob\w*|undress|bra|panty|panties|shag|virgin|orgasm|condom|lust|sexual|hottie|dirty|nipple|ass|strip|randy|satisfy|erotic|wank\w*|tits|fetish|rs\.?|inr|free|offer|win|won|prize|voucher|claim|subscri\w*|opt|otp|pin|account|bank|balance|credit|debit|order|deliver\w*|parcel|flight|ticket|appointment|bill|payment|price|www|http\w*|ringtone|network|charge|award|cash|holiday|tariff|msg|sms|txt|reply|stop|dating|chat|contact|service|customer|mobile|sent via)\b|[£$€]|\.com|\d{5,}|\b(expense|income|spam|promo)\b", re.I)
SPAM_BAD = re.compile(r"\b(hardcore|booty\w*|lnly|feelin|inviting|friend|frnd|cam|pic|moby|age verify|randy|satisfy|horny|naughty|lonely|hot|girls?|babe|sex\w*|xxx|pix|adult|nude|strip\w*|gay|lesbian|erotic|chat line|dating|singles|18\+|welcome to|brought to you|dear subscriber|expense|income|spam|promo)\b", re.I)
SPAM_OK = re.compile(r"\b(won|win|prize|claim|guaranteed|urgent|free|txt|stop|ppm)\b|£\d{3,}|\d+p/|\b0[789]\d{8,}\b", re.I)
LABEL = re.compile(r"\b(expense|expenses|income|spam|promo)\b", re.I)
KEY = lambda t: " ".join(re.findall(r"[a-z]+", t.lower()))
NAMES = "Mom Dad Rahul Priya Sam Alex Anita Work Jay Maya Chris Sis Bro Neha Dan".split()


POOLS = {"bill": BILLM, "promo": PROMOM, "alert": ALERTM, "delivery": DELM}
TOTAL = dict(otp=330, expense=544, income=300, bill=300, delivery=300, alert=320, promo=330, spam=460)
RULES = [
    (r"vaccin", "hospital clinic"), (r"dental|cleaning appointment", "dental"), (r"\bfly\b|fares from|flights?\b", "airline ota"), (r"\bgate\b", "airline"),
    (r"early check-in|check-in time|your stay|\bhotels?\b", "hotel ota"), (r"policy|premium", "insurance"), (r"electricity", "elec"), (r"broadband", "broadband"), (r"postpaid", "telecom"),
    (r"\brent\b", "rent"), (r"\bcart\b|wishlist", "etail store"), (r"in store|at the store|storewide", "store restaurant"), (r"medicines|refill|coupon", "pharmacy"), (r"\bSIM\b", "telecom"),
    (r"\btrain\b|platform|PNR", "train"), (r"groceries|fruits", "grocery"),
]


def pool_of(cls, sub, region):
    return POOLS[cls][sub][region] if cls in POOLS else SHOPS[region]


def gen(tpls, n, region_w, setup, sub, p_hard):
    out = []
    while len(out) < n:
        region = R.choices(["IN", "US"], region_w)[0]
        c = Ctx(region=region)
        setup(c)
        ok = [t for t in tpls if t["region"] in (region, "ANY")]
        if sub:
            c["cat"] = sub
            ok = [t for t in ok if t["cats"] == ALL or (t["cats"] is None and sub != "transfer") or (t["cats"] not in (None, ALL) and sub in t["cats"])]
        if c.get("dom"):
            ok = [t for t in ok if not t["dom"] or c["dom"] in t["dom"]]
        hot, cold = [t for t in ok if t["hard"]], [t for t in ok if not t["hard"]]
        t = pick(hot) if hot and (chance(p_hard) or not cold) else pick(cold)
        if region == "US" and ACCT.search(t["text"]):
            c["b"] = pick(ACCT_BANKS)
        out.append((t, c))
    return out


def render(t, c):
    for k in re.findall(r"\{(\w+)\}", t["text"]):
        c[k]
    return t["text"].format_map(c), sender(t["snd"], c)


def noise(t, cls):
    if cls in ("spam", "promo") and chance(.04):
        t = t.lower()
    if chance(.04):
        at = [i for i, ch in enumerate(t) if ch == " "]
        if at:
            i = pick(at)
            t = t[:i] + "  " + t[i + 1:]
    if chance(.05):
        t = t.rstrip(".")
    if chance(.10 if cls == "spam" else .03):
        ws = list(re.finditer(r"\b[a-z]{5,}\b", t))
        if ws:
            m = pick(ws)
            i = R.randint(m.start() + 1, m.end() - 3)
            t = t[:i] + t[i + 1] + t[i] + t[i + 2:]
    urls = re.findall(r"(?:https?://|www\.)\S+|\b[a-z0-9-]+\.(?:in|com|io|top|xyz|to|ly)/\S+", t)
    if urls and chance(.12):
        u = urls[-1]
        if len(u) > 14:
            t = t.replace(u, u[:len(u) - R.randint(2, 5)])
    return t


def setup_for(cls, sub=None):
    def f(c):
        p = pool_of(cls, sub, c["region"])
        if p is None:
            c["mn"] = ""
        else:
            c["m"] = pick(p)
    return f


def payee(p):
    f, _, l = p.lower().partition(" ")
    return pick([f"{f}.{l}", f"{f}{l}", f"{f}{digits(2)}", digits(10)]) + "@" + pick(HANDLES)


def mstyle(n, region):
    r = R.random()
    if r < .45:
        return n
    if r < .8:
        return n.upper()
    if region == "IN":
        return n.upper() + " " + pick(["MUMBAI", "BANGALORE", "DELHI", "HYDERABAD", "PUNE", "CHENNAI", "IN", "INDIA", "ONLINE"])
    return pick(["SQ *" + n.upper(), "TST* " + n, n.upper() + " #" + digits(4), n.upper() + " " + pick(["NEW YORK NY", "SAN JOSE CA", "AUSTIN TX", "CHICAGO IL", "SEATTLE WA"])])


def setup_expense(cat):
    def f(c):
        if cat == "transfer":
            p = person(c["region"])
            c["m"] = pick([p, p.upper(), p.split()[0] + " " + p.split()[1][0], p.split()[0] + " " + p.split()[1][0] + "."])
            c["payee"] = payee(p)
            return
        if cat == "bills":
            c["dom"] = pick([k for k in BILLM if BILLM[k][c["region"]]])
            name = pick(BILLM[c["dom"]][c["region"]])
        else:
            name = pick(MER[cat][c["region"]])
        c["m"] = mstyle(name, c["region"])
        c["mn"] = name
        c["payee"] = slug(name) + pick(["", "", "." + digits(3), ".bbps"]) + "@" + pick(HANDLES)
    return f


def build(cls, tpls, n, setup, region_w, sub, p_hard):
    items = []
    for t, c in gen(tpls, n, region_w, setup, sub, p_hard):
        text, snd = render(t, c)
        pooled = cls in POOLS and pool_of(cls, sub, c["region"]) is not None
        items.append(dict(sender=snd, text=noise(text, cls), type=cls, cat=sub if cls == "expense" else "", kind=sub if cls in POOLS else None, region=c["region"], bank=c["b"][0] if "b" in c else None,
                          tid=f"{cls}:{tpls.index(t)}", hard=t["hard"] or sub == "transfer", m=c.get("mn", c.get("m", "")), ent=c["m"] if pooled else ""))
    return items


def real(t, cls, snd):
    return dict(sender=snd, text=t, type=cls, cat="", kind=None, region=None, bank=None, tid=f"{cls}:uci", hard=False, m="", ent="")


def uci_real():
    rows = uci()
    ham = [t for t, l in rows if l == 0 and len(t) >= 24 and not HAM_BAD.search(t)]
    spam = [t for t, l in rows if l == 1 and SPAM_OK.search(t) and not SPAM_BAD.search(t) and not LABEL.search(t)]
    R.shuffle(ham)
    R.shuffle(spam)
    return (
        [real(t, "personal", pick(NAMES) if chance(.55) else phone(pick(["IN", "US"]))) for t in ham],
        [real(t, "spam", pick([digits(5), digits(5), f"+44 7{digits(9)}", f"0{digits(10)}"])) for t in spam],
    )


def tri(t):
    w = KEY(t).split()
    return {tuple(w[i:i + 3]) for i in range(max(1, len(w) - 2))}


def dedupe(items, state, cap, limit):
    seen, grams, used = state
    keep = []
    for it in items:
        if len(keep) >= limit:
            break
        k = KEY(it["text"])
        if used[it["tid"]] >= cap or k in seen or not k:
            continue
        g = tri(it["text"])
        if any(len(g & o) / len(g | o) >= .85 for o in grams[it["type"]]):
            continue
        seen[k] = it["type"]
        grams[it["type"]].append(g)
        used[it["tid"]] += 1
        keep.append(it)
    return keep


def fill(state, cls, tpls, n, setup, sub=None, p_hard=0.0):
    rw = [w if pool_of(cls, sub, r) != [] else 0 for r, w in (("IN", .6), ("US", .4))]
    out = []
    for _ in range(30):
        out += dedupe(build(cls, tpls, 2 * n, setup, rw, sub, p_hard), state, int(.05 * TOTAL[cls]), n - len(out))
        if len(out) >= n:
            return out
    sys.exit(f"short: {cls} {sub} {len(out)} of {n}")


LISTS = dict(otp=OTP, expense=EXPENSE, income=INCOME, bill=BILL, delivery=DELIVERY, alert=ALERT, promo=PROMO, spam=SPAM)


def main():
    state = ({}, defaultdict(list), Counter())
    pool = []
    real_ham, real_spam = uci_real()
    pool += dedupe(real_ham[:UCI_PERSONAL * 2], state, len(real_ham), UCI_PERSONAL)
    pool += dedupe(real_spam[:UCI_SPAM * 2], state, len(real_spam), UCI_SPAM)
    for cls, n, p in [("otp", 330, 0), ("income", 300, .3), ("spam", GEN_SPAM, .35)]:
        pool += fill(state, cls, LISTS[cls], n, setup_for(cls), None, p)
    for cls, quota, p in [("bill", BILLQ, 0), ("promo", PROMOQ, .2), ("alert", ALERTQ, .15), ("delivery", DELQ, .2)]:
        for kind, n in quota.items():
            pool += fill(state, cls, LISTS[cls], n, setup_for(cls, kind), kind, p)
    for cat in CATS:
        pool += fill(state, "expense", EXPENSE, QUOTA[cat], setup_expense(cat), cat, .4 if cat == "bills" else 0)
    R.shuffle(pool)
    stats = check(pool)
    rows = [[i["sender"], i["text"], i["type"], *([i["cat"]] if i["cat"] else [])] for i in pool]
    (OUT / "inbox.json").write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")))
    (OUT / "inbox.stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=1))
    top = top_templates(pool)
    if len(sys.argv) > 1:
        sample(pool, Path(sys.argv[1]), top)
    print(json.dumps({k: stats[k] for k in ("total", "hard", "hardShare", "sources")}))
    for cls, s in stats["classes"].items():
        print(f"{cls:9} n={s['n']:4} templates={s['templates']:3} top={s['topShare']:.3f} senders={s['senders']:4} merchants={s['merchants']:3} hard={s['hard']:3} len={s['meanLen']}")
    for cat, s in stats["categories"].items():
        print(f"  {cat:14} n={s['n']:3} templates={s['templates']:3} merchants={s['merchants']:3}")
    print("\n".join(top))
    print("outputs", (OUT / "inbox.json").stat().st_size, "bytes")


def top_templates(pool):
    lines = []
    for cls in TYPES:
        items = [i for i in pool if i["type"] == cls]
        lines.append(f"--- top templates in {cls} ({len(items)}) ---")
        for tid, k in Counter(i["tid"] for i in items).most_common(10):
            idx = tid.split(":")[1]
            lines.append(f"{k / len(items):6.1%} {k:4}  {tid}  {LISTS[cls][int(idx)]['text'][:80] if idx != 'uci' else 'real UCI messages'}")
    return lines


def check(pool):
    fails, n = [], len(pool)
    by = defaultdict(list)
    for i in pool:
        by[i["type"]].append(i)
    if not 2500 <= n <= 3500:
        fails.append(f"size {n} outside 2500..3500")
    for cls in TYPES:
        if len(by[cls]) / n < .06:
            fails.append(f"class {cls} under 6%: {len(by[cls])}")
    keys = Counter(KEY(i["text"]) for i in pool)
    fails += [f"duplicate: {k}" for k, c in keys.items() if c > 1]
    for i in pool:
        if i["type"] == "expense" and i["cat"] not in CATS:
            fails.append(f"expense without category: {i['text']}")
        if i["type"] != "expense" and i["cat"]:
            fails.append(f"category on {i['type']}: {i['text']}")
        if LABEL.search(i["text"]):
            fails.append(f"label word: {i['text']}")
        if i["cat"] and i["cat"] != "other" and re.search(rf"\b{i['cat']}\b", i["text"], re.I):
            fails.append(f"category word {i['cat']}: {i['text']}")
        if i["type"] not in ("spam", "personal") and re.fullmatch(r"\+?[\d ()-]{10,}", i["sender"]):
            fails.append(f"brand sender looks personal: {i['sender']} | {i['text']}")
        if i["kind"] and i["ent"] and i["ent"] not in pool_of(i["type"], i["kind"], i["region"]):
            fails.append(f"{i['ent']} is not a {i['kind']} sender: {i['text']}")
        for rx, kinds in RULES:
            if i["kind"] and re.search(rx, i["text"], re.I) and i["kind"] not in kinds.split():
                fails.append(f"{i['kind']} sender with '{rx}' text: {i['text']}")
        if i["region"] == "US" and i["bank"] and ACCT.search(i["text"]) and i["bank"] not in [b[0] for b in ACCT_BANKS]:
            fails.append(f"card issuer {i['bank']} with account text: {i['text']}")
    hard = sum(i["hard"] for i in pool)
    if not .12 <= hard / n <= .18:
        fails.append(f"hard share {hard / n:.3f} outside .12..18")
    for cls, items in by.items():
        gen_ids = Counter(i["tid"] for i in items if not i["tid"].endswith("uci"))
        if gen_ids and gen_ids.most_common(1)[0][1] / len(items) > .05:
            fails.append(f"template {gen_ids.most_common(1)[0][0]} is {gen_ids.most_common(1)[0][1]} of {len(items)}")
        if cls != "personal" and len(gen_ids) < 25:
            fails.append(f"class {cls} has {len(gen_ids)} generated templates")
    for cat in CATS:
        ex = [i for i in pool if i["cat"] == cat]
        if len(ex) < 40 or (cat != "other" and len({i["m"] for i in ex if i["m"] and i["m"].lower() in i["text"].lower()}) < 15):
            fails.append(f"category {cat} thin: {len(ex)}")
    if fails:
        print("\n".join(fails[:40]), file=sys.stderr)
        sys.exit(f"{len(fails)} quality gate failures")
    mers = lambda items: {i["m"] for i in items if i["m"] and i["m"].lower() in i["text"].lower()}
    card = lambda items: dict(n=len(items), templates=len({i["tid"] for i in items if not i["tid"].endswith("uci")}), topShare=max(Counter(i["tid"] for i in items if not i["tid"].endswith("uci")).values(), default=0) / len(items),
                              senders=len({i["sender"] for i in items}), merchants=len(mers(items)), hard=sum(i["hard"] for i in items), meanLen=round(sum(len(i["text"]) for i in items) / len(items)))
    return dict(
        total=n, hard=hard, hardShare=round(hard / n, 3),
        sources={"uci": sum(i["tid"].endswith("uci") for i in pool), "generated": sum(not i["tid"].endswith("uci") for i in pool)},
        classes={c: {**card(by[c]), "topShare": round(card(by[c])["topShare"], 3)} for c in TYPES},
        categories={c: {k: v for k, v in card([i for i in pool if i["cat"] == c]).items() if k in ("n", "templates", "merchants")} for c in CATS},
    )


def sample(pool, path, top):
    r = random.Random(5)
    lines = []
    for cls in TYPES:
        items = [i for i in pool if i["type"] == cls]
        lines.append(f"=== {cls} ({len(items)}) ===")
        for i in r.sample(items, 40):
            lines.append(f"[{i['cat'] or i['kind'] or '-'}]{' H' if i['hard'] else '  '} {i['sender']} | {i['text']}")
    path.write_text("\n".join(lines + [""] + top))


if __name__ == "__main__":
    main()
