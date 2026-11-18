/**
 * The phrase book (implementation plan N4.5, docs/design/orders.md "Bubbles and the phrase book"): what the men say, as
 * data, in English and German, several variants a line so a man does not repeat himself. Pure. The reports table
 * (reports.ts) names a line and its terms; the bubbles (bubbles.ts) pick a variant by the match's seed and fill the
 * terms in the player's language (the settings). Both navies speak the player's language, since a bubble must be read
 * at a glance; a French crew differs in its turns of phrase (`french`). The sea words stay, with nothing explained:
 * the men doing it is the explanation.
 */
import type { Language } from '../settings';
import type { Navy } from '../crewLooks';
import type { Voice } from './speakers';

/** A line in each language, its variants; a French crew's own turns of phrase where they differ. */
export interface Phrase {
  readonly en: readonly string[];
  readonly de: readonly string[];
  readonly french?: { readonly en: readonly string[]; readonly de: readonly string[] };
}

/** "Aye aye, sir" in its variants: the plain answer to an order taken as given. */
const AYE: Phrase = {
  en: ['Aye aye, sir.', 'Aye aye, sir!', 'Very good, sir.'],
  de: ['Jawohl, Herr Kapitän.', 'Zu Befehl, Herr Kapitän!', 'Jawohl, Herr Kapitän!'],
  french: { en: ['At once, captain.', 'Very good, captain.'], de: ['Sofort, Kommandant.', 'Zu Befehl, Kommandant!'] },
};

const p = (en: readonly string[], de: readonly string[], french?: Phrase['french']): Phrase => (french ? { en, de, french } : { en, de });

/** Every line the men say, by its key. `{side}`, `{mast}`, `{where}` are terms (`TERMS`), filled in the player's language. */
export const PHRASES = {
  // ---- Answers to orders taken (the man addressed), and the order passed down the chain (the boatswain) ----
  'aye': AYE,
  'aye.steer': p(['Aye aye, sir. Bring her round.', 'Aye aye, sir, as you point.'], ['Jawohl, Herr Kapitän. Wir drehen.', 'Jawohl, Kurs wie gezeigt.']),
  'aye.up': p(['Up a point, sir.', 'Luff a point, sir.'], ['Einen Strich anluven, Herr Kapitän.', 'Anluven, einen Strich.']),
  'aye.away': p(['Off a point, sir.', 'Bear away a point, sir.'], ['Einen Strich abfallen, Herr Kapitän.', 'Abfallen, einen Strich.']),
  'aye.follow': p(['Steer for her, sir. Aye aye.', 'After her, sir!'], ['Auf sie zu, Herr Kapitän. Jawohl.', 'Hinter ihr her, Herr Kapitän!']),
  'aye.rake': p(['Across her stern, sir. Aye aye.', "I'll take us across her stern, sir."], ['Über ihr Heck, Herr Kapitän. Jawohl.', 'Ich führe uns über ihr Heck, Herr Kapitän.']),
  'aye.crossbow': p(['Across her bow, sir. Aye aye.', "I'll take us across her bow, sir."], ['Über ihren Bug, Herr Kapitän. Jawohl.', 'Ich führe uns über ihren Bug, Herr Kapitän.']),
  'aye.abeam': p(['Keep her on the beam, sir. Aye aye.', 'Abeam it is, sir, at this distance.'], ['Sie querab halten, Herr Kapitän. Jawohl.', 'Jawohl, querab, auf diesen Abstand.']),
  'aye.by': p(['Full and by, sir.', 'Full and by it is, sir.'], ['Hoch am Wind, Herr Kapitän.', 'So hoch sie geht, Herr Kapitän.']),
  'aye.tack': p(['Aye aye, sir. Ready about!', 'Ready about, sir!'], ['Jawohl! Klar zur Wende!', 'Klar zur Wende, Herr Kapitän!']),
  'aye.wear': p(['Aye aye, sir. Stand by to wear ship!', 'Wear ship, sir!'], ['Jawohl! Klar zum Halsen!', 'Halsen, Herr Kapitän!']),
  'aye.heave': p(['Heave to, sir. Aye aye.', 'Aye aye, sir. Heave her to.'], ['Beidrehen, Herr Kapitän. Jawohl.', 'Jawohl, wir drehen bei.']),
  'aye.sail.battle': p(['Battle sail, sir!', 'Fighting sail, aye aye, sir.'], ['Gefechtssegel, Herr Kapitän!', 'Jawohl, Gefechtssegel.']),
  'aye.sail.plain': p(['Plain sail, sir.', 'Plain sail, aye aye.'], ['Normale Segel, Herr Kapitän.', 'Jawohl, normale Segel.']),
  'aye.sail.all': p(['All sail, sir!', 'Every stitch, sir!'], ['Alle Segel, Herr Kapitän!', 'Jeden Fetzen Tuch, Herr Kapitän!']),
  'aye.shorten': p(['Shorten sail, sir.', 'Take it in, sir. Aye aye.'], ['Segel kürzen, Herr Kapitän.', 'Jawohl, wir kürzen.']),
  'aye.back': p(['Back the {mast} topsail, sir.', 'Lay the {mast} yards aback, sir.'], ['{mast}marssegel back, Herr Kapitän.', 'Jawohl, {mast}rahen back.']),
  'aye.fill': p(['Fill away, sir.', 'Let her draw, sir.'], ['Vollbrassen, Herr Kapitän.', 'Jawohl, sie soll ziehen.']),
  'aye.quarters': p(['Beat to quarters, sir! Aye aye.', 'Clear for action, sir!'], ['Klar Schiff zum Gefecht, Herr Kapitän!', 'Jawohl! Alle Mann auf Gefechtsstation!']),
  'aye.stand': p(['Stand down, sir.', 'Secure from quarters, sir.'], ['Gefechtsstationen auflösen, Herr Kapitän.', 'Jawohl, wir treten weg.']),
  'aye.shot.round': p(['Round shot, sir.', 'Round shot it is, sir.'], ['Vollkugeln, Herr Kapitän.', 'Jawohl, Vollkugeln.']),
  'aye.shot.chain': p(['Chain shot, sir. For her rigging.', 'Chain it is, sir.'], ['Kettenkugeln, Herr Kapitän. Für ihre Takelage.', 'Jawohl, Kettenkugeln.']),
  'aye.shot.grape': p(['Grape, sir!', 'Grape it is, sir.'], ['Kartätschen, Herr Kapitän!', 'Jawohl, Kartätschen.']),
  'aye.aim.hull': p(['Her hull, sir.', 'Laid for her hull, sir.'], ['Auf den Rumpf, Herr Kapitän.', 'Jawohl, auf den Rumpf.']),
  'aye.aim.rigging': p(['Her rigging, sir.', 'High, sir, for her spars.'], ['Auf die Takelage, Herr Kapitän.', 'Hoch, Herr Kapitän, auf die Rahen.']),
  'aye.target': p(['Laying on her, sir.', 'Aye, sir, we lay on her.'], ['Wir richten uns auf sie, Herr Kapitän.', 'Jawohl, wir halten auf sie.']),
  'aye.target.nearest': p(['The nearest, sir.', 'Whichever is nearest, sir.'], ['Auf den nächsten, Herr Kapitän.', 'Jawohl, auf den nächsten.']),
  'aye.aim.deck': p(['Sweep her deck, sir.', 'Her deck, sir.'], ['Auf ihr Deck, Herr Kapitän.', 'Jawohl, das Deck fegen.']),
  'aye.bear': p(['Fire as they bear, sir!', 'As they bear, aye aye!'], ['Feuer, sobald sie tragen, Herr Kapitän!', 'Jawohl, Feuer nach Belieben!']),
  'aye.hold': p(['Hold for your word, sir.', 'We wait your word, sir.'], ['Wir warten auf Ihr Wort, Herr Kapitän.', 'Jawohl, Feuer halten.']),
  'aye.fire': p(['Fire!', 'Fire! Fire!'], ['Feuer!', 'Feuer! Feuer!']),
  'aye.cease': p(['Cease firing, sir!', 'Cease fire! Aye aye.'], ['Feuer einstellen, Herr Kapitän!', 'Jawohl, Feuer einstellen!']),
  'aye.pumps': p(['Hands to the pumps, sir. That takes men from the guns.', 'Pumps, sir. I take them from the guns.'], ['Alle Mann an die Pumpen, Herr Kapitän. Das kostet Leute an den Kanonen.', 'Pumpen, Herr Kapitän. Die Leute fehlen an den Kanonen.']),
  'aye.fires': p(['Fire party away, sir!', 'Buckets and hoses, sir!'], ['Feuertrupp los, Herr Kapitän!', 'Eimer und Pützen, Herr Kapitän!']),
  'aye.wreckage': p(['Clear the wreckage, sir. Axes forward!', 'Cut it away, sir!'], ['Wrackteile kappen, Herr Kapitän. Äxte nach vorn!', 'Jawohl, wir kappen!']),
  'aye.plug': p(['The shot holes first, sir.', 'Plugs first, sir.'], ['Erst die Schusslöcher, Herr Kapitän.', 'Jawohl, erst stopfen.']),
  'aye.pumping': p(['The pumps first, sir.', 'Pumps first, sir.'], ['Erst die Pumpen, Herr Kapitän.', 'Jawohl, erst pumpen.']),
  'aye.strike': p(['Aye aye, sir. Haul down the colours.', 'Strike the colours, sir.'], ['Jawohl, Herr Kapitän. Flagge nieder.', 'Die Flagge streichen, Herr Kapitän.']),
  'pass.tack': p(['Ready about! Stations for stays!', 'Ready about!'], ['Klar zur Wende! Auf Stationen!', 'Klar zur Wende!']),
  'pass.wear': p(['Hands wear ship!', 'Stand by to wear!'], ['Alle Mann zum Halsen!', 'Klar zum Halsen!']),
  'pass.heave': p(['Main yards aback! Haul up the courses!', 'Back the main yard!'], ['Großrahen back! Untersegel auf!', 'Großrah back!']),
  'pass.sail': p(['Away aloft! Loose sail!', 'Hands make sail!'], ['Auf in die Wanten! Segel los!', 'Alle Mann Segel setzen!']),
  'pass.shorten': p(['Hands shorten sail!', 'Away aloft! Take it in!'], ['Alle Mann Segel kürzen!', 'Auf in die Wanten! Segel bergen!']),
  'pass.back': p(['Brace aback the {mast} yards!', 'Lay the {mast} yards aback!'], ['{mast}rahen back brassen!', '{mast}rahen back!']),
  'pass.fill': p(['Let her draw! Brace round!', 'Fill away!'], ['Vollbrassen! Rund die Rahen!', 'Lass sie ziehen!']),
  'pass.quarters': p(['All hands to quarters!', 'Clear for action! Cast loose your guns!'], ['Alle Mann auf Gefechtsstation!', 'Klar Schiff! Kanonen los!']),
  'pass.stand': p(['Secure the guns!', 'Stand down from quarters!'], ['Kanonen zurrt fest!', 'Gefechtsstationen wegtreten!']),
  // ---- Answers with words (orders.ts AnswerCode) ----
  'will not lie': p(["She won't lie that course, sir. Full and by.", "Too close, sir. I'll keep her full and by."], ['So hoch liegt sie nicht, Herr Kapitän. Hoch am Wind.', 'Zu hoch, Herr Kapitän. Ich halte sie hoch am Wind.']),
  'wearing round': p(['Wearing round, sir.', "She'll go round before it, sir."], ['Wir halsen herum, Herr Kapitän.', 'Sie geht vor dem Wind herum, Herr Kapitän.']),
  'aye.sound': p(['Sounding the well, sir.', 'I will sound her, sir.'], ['Ich peile die Bilge, Herr Kapitän.', 'Jawohl, wird gepeilt.']),
  // The well sounded (orders.ts 'sounded'; reports.ts picks the line by the water in her, notices.ts WATER_MARKS).
  'sounded 0': p(['The well is near dry, sir.', 'Sounded the well, sir. Hardly a foot.'], ['Die Bilge ist fast trocken, Herr Kapitän.', 'Gepeilt, Herr Kapitän. Kaum ein Fuß.']),
  'sounded 1': p(['Two feet in the well, sir. The pumps hold it.', 'Some water in her, sir. Nothing the pumps cannot hold.'], ['Zwei Fuß in der Bilge, Herr Kapitän. Die Pumpen halten es.', 'Etwas Wasser, Herr Kapitän. Die Pumpen schaffen das.']),
  'sounded 2': p(["Four feet in the well, sir, and gaining.", "The water's gaining, sir. Four feet."], ['Vier Fuß in der Bilge, Herr Kapitän, und es steigt.', 'Das Wasser steigt, Herr Kapitän. Vier Fuß.']),
  'sounded 3': p(["Six feet and more, sir! She's settling!"], ['Sechs Fuß und mehr, Herr Kapitän! Sie sackt weg!']),
  'strike, sir?': p(['Strike, sir? Our colours?', 'Strike, sir? Say it again, and I will.'], ['Streichen, Herr Kapitän? Unsere Flagge?', 'Streichen, Herr Kapitän? Sagen Sie es noch einmal.']),
  // ---- Refusals (orders.ts RefusalCode): why not ----
  'full and by already': p(["She's full and by now, sir."], ['Sie liegt schon hoch am Wind, Herr Kapitän.']),
  'no way': p(['She has no way on her, sir.', "She won't answer, sir. No way on her."], ['Sie hat keine Fahrt, Herr Kapitän.', 'Sie gehorcht nicht, Herr Kapitän. Keine Fahrt.']),
  'in stays': p(["She's in stays, sir. Let her come round.", "Not now, sir, she's in stays."], ['Sie ist im Wenden, Herr Kapitän. Erst herum.', 'Jetzt nicht, Herr Kapitän, sie wendet.']),
  'hove to already': p(["She's hove to, sir."], ['Sie liegt schon beigedreht, Herr Kapitän.']),
  'canvas already': p(["That's what she carries, sir."], ['Das trägt sie schon, Herr Kapitän.']),
  'carries it already': p(['She carries it already, sir.'], ['Das hat sie schon gesetzt, Herr Kapitän.']),
  'bare poles': p(["She's under bare poles, sir. There's nothing left to take in."], ['Sie läuft vor Topp und Takel, Herr Kapitän. Da ist nichts mehr.']),
  'aback already': p(["It's aback already, sir."], ['Die liegen schon back, Herr Kapitän.']),
  'drawing': p(["She's drawing, sir."], ['Sie zieht schon, Herr Kapitän.']),
  'not at quarters': p(["The men aren't at quarters, sir.", 'Beat to quarters first, sir.'], ['Die Leute sind nicht auf Station, Herr Kapitän.', 'Erst Klar Schiff, Herr Kapitän.']),
  'at quarters already': p(["We're at quarters, sir."], ['Wir sind auf Station, Herr Kapitän.']),
  'loading it already': p(["We're loading that, sir."], ['Das laden wir schon, Herr Kapitän.']),
  'laid there already': p(["They're laid so, sir."], ['So sind sie gerichtet, Herr Kapitän.']),
  'firing so already': p(["We're doing so, sir."], ['Das tun wir schon, Herr Kapitän.']),
  'not held': p(["The guns aren't held, sir."], ['Die Kanonen warten nicht, Herr Kapitän.']),
  'word given': p(["They've had the word, sir."], ['Sie haben das Wort schon, Herr Kapitän.']),
  'not firing': p(["We're not firing, sir."], ['Wir feuern nicht, Herr Kapitän.']),
  'sent already': p(["They're at it, sir."], ['Die sind schon dabei, Herr Kapitän.']),
  'first already': p(["That's what they do first, sir."], ['Das tun sie schon zuerst, Herr Kapitän.']),
  'no enemy': p(["There's no ship to steer by, sir."], ['Da ist kein Schiff, Herr Kapitän.']),
  'keeping so already': p(["I'm steering for her, sir."], ['Ich halte schon auf sie zu, Herr Kapitän.']),
  'fight over': p(["It's over, sir."], ['Es ist vorbei, Herr Kapitän.']),
  // ---- Reports: her sailing, the wind ----
  'tacked': p(["She's about, sir.", 'Round she comes, sir. Full and by.'], ['Sie ist herum, Herr Kapitän.', 'Herum, Herr Kapitän. Hoch am Wind.']),
  'wore': p(["She's round, sir.", 'Worn round, sir.'], ['Sie ist herum, Herr Kapitän.', 'Gehalst, Herr Kapitän.']),
  'missed stays': p(['Missed stays, sir!', "She won't come round, sir! Missed stays!"], ['Wende verpatzt, Herr Kapitän!', 'Sie kommt nicht herum, Herr Kapitän!']),
  'bore away': p(['Bearing away a point, sir, she was taken aback.', 'She was taken aback, sir: bearing away a point.'], ['Fallen ab um einen Strich, Herr Kapitän, sie wurde back gedrückt.', 'Ich falle einen Strich ab, Herr Kapitän, die Segel standen back.']),
  'wind shifts': p(["The wind's shifting, sir.", "Wind's coming round, sir."], ['Der Wind dreht, Herr Kapitän.', 'Der Wind geht herum, Herr Kapitän.']),
  'wind freshens': p(["It's freshening, sir.", "Wind's getting up, sir."], ['Es frischt auf, Herr Kapitän.', 'Der Wind nimmt zu, Herr Kapitän.']),
  'wind eases': p(["It's easing, sir.", "Wind's falling light, sir."], ['Es flaut ab, Herr Kapitän.', 'Der Wind lässt nach, Herr Kapitän.']),
  'her ahead of the beam': p(["She's drawing ahead, sir.", "We're dropping astern of her, sir."], ['Sie zieht voraus, Herr Kapitän.', 'Wir fallen achteraus, Herr Kapitän.']),
  'across her stern': p(["We're across her stern, sir!", 'Her stern is under our guns, sir.'], ['Wir stehen quer über ihrem Heck, Herr Kapitän!', 'Ihr Heck liegt vor unseren Kanonen, Herr Kapitän.']),
  'across her bow': p(["We're across her bow, sir!", 'Her bow is under our guns, sir.'], ['Wir stehen quer vor ihrem Bug, Herr Kapitän!', 'Ihr Bug liegt vor unseren Kanonen, Herr Kapitän.']),
  'her astern of the beam': p(["She's dropping astern, sir.", "We're running ahead of her, sir."], ['Sie fällt achteraus, Herr Kapitän.', 'Wir laufen ihr voraus, Herr Kapitän.']),
  'losing': p(["We're losing her, sir.", "She's drawing out of range, sir."], ['Wir verlieren sie, Herr Kapitän.', 'Sie kommt außer Sicht, Herr Kapitän.']),
  'apart': p(['We have sailed apart, sir. The action is broken off.'], ['Wir sind auseinandergesegelt, Herr Kapitän. Das Gefecht ist abgebrochen.']),
  'light': p(['The light is failing, sir.', "We'll lose the light soon, sir."], ['Das Licht schwindet, Herr Kapitän.', 'Bald wird es dunkel, Herr Kapitän.']),
  'short-handed': p(["Too few hands for that, sir. It'll be slow.", "We're short of hands, sir."], ['Zu wenig Leute dafür, Herr Kapitän. Das dauert.', 'Uns fehlen Hände, Herr Kapitän.']),
  // ---- Reports: the lookout on her ----
  'sighted': p(['Sail ho! Deck there, a sail {where}!', 'Deck there! Sail {where}!'], ['Segel in Sicht! An Deck, ein Segel {where}!', 'An Deck! Segel {where}!']),
  'her tacked': p(['Deck there! She tacks!', "She's going about!"], ['An Deck! Sie wendet!', 'Sie geht über Stag!']),
  'her wore': p(['Deck there! She wears!', "She's wearing round!"], ['An Deck! Sie halst!', 'Sie geht vor dem Wind herum!']),
  'her missed stays': p(["Deck there! She's missed stays!"], ['An Deck! Ihre Wende misslingt!']),
  'her makes sail': p(["Deck there! She's making sail!"], ['An Deck! Sie setzt mehr Segel!']),
  'her shortens': p(["Deck there! She's shortening sail!"], ['An Deck! Sie kürzt die Segel!']),
  'her ports': p(["Deck there! She's opened her ports!", 'She runs out her guns, sir!'], ['An Deck! Sie öffnet ihre Stückpforten!', 'Sie rennt die Kanonen aus, Herr Kapitän!']),
  'her mast': p(["Deck there! Her {mast}mast's gone!", 'Her {mast}mast is down!'], ['An Deck! Ihr {mast}mast ist weg!', 'Ihr {mast}mast ist gefallen!']),
  'her struck': p(["She strikes! She's hauled down her colours!", 'She strikes, sir!'], ['Sie streicht die Flagge!', 'Sie streicht, Herr Kapitän!']),
  'her sinking': p(["She's going down, sir!"], ['Sie sinkt, Herr Kapitän!']),
  'her broke off': p(["She's run, sir! She has broken off the action."], ['Sie läuft davon, Herr Kapitän! Sie bricht das Gefecht ab.']),
  'her burning': p(["She's burning, sir! She's done for!"], ['Sie brennt aus, Herr Kapitän!']),
  'her blew up': p(['God help them, she has blown up!'], ['Gott steh ihnen bei, sie ist in die Luft geflogen!']),
  'nightfall': p(["We've lost her in the dark, sir."], ['Wir haben sie in der Dunkelheit verloren, Herr Kapitän.']),
  // ---- Reports: the guns ----
  'side ready': p(['{side} guns ready, sir!', '{side} side ready, sir!'], ['{side}-Kanonen klar, Herr Kapitän!', '{side} klar, Herr Kapitän!']),
  'guns bear': p(['The guns bear, sir!', '{side} guns bear, sir! Your word!'], ['Die Kanonen tragen, Herr Kapitän!', '{side} trägt, Herr Kapitän! Ihr Wort!']),
  'gun dismounted': p(['A gun dismounted, sir!', "We've lost a gun, sir!"], ['Eine Kanone ist umgeworfen, Herr Kapitän!', 'Wir haben eine Kanone verloren, Herr Kapitän!']),
  // ---- Reports: her hull and her life ----
  'water 0': p(['Water in the well, sir.', "There's water making, sir."], ['Wasser in der Bilge, Herr Kapitän.', 'Sie macht Wasser, Herr Kapitän.']),
  'water 1': p(["The water's gaining on us, sir!", 'Water rising in the well, sir!'], ['Das Wasser steigt, Herr Kapitän!', 'Das Wasser gewinnt, Herr Kapitän!']),
  'water 2': p(["She's settling, sir! The water's gaining fast!"], ['Sie sackt weg, Herr Kapitän! Das Wasser steigt schnell!']),
  'holed': p(["We're holed below the waterline, sir!", 'Shot between wind and water, sir!'], ['Treffer unter der Wasserlinie, Herr Kapitän!', 'Ein Leck unter Wasser, Herr Kapitän!']),
  'spar wounded': p(['A spar is wounded, sir.', "The {mast}mast's wounded, sir."], ['Eine Spiere ist angeschossen, Herr Kapitän.', 'Der {mast}mast ist angeschossen, Herr Kapitän.']),
  'stay gone': p(["The {mast}stay's gone, sir! She's aback!", "The {mast}stay's shot away! Fill her, sir, or we lose the {mast}mast!"], ['Das {mast}stag ist weg, Herr Kapitän! Die Segel stehen back!', 'Das {mast}stag ist weggeschossen! Füllen, oder der {mast}mast geht über Bord!']),
  'mast fell': p(["The {mast}mast's gone, sir!", "Look out below! The {mast}mast's coming down!"], ['Der {mast}mast ist weg, Herr Kapitän!', 'Achtung unten! Der {mast}mast fällt!']),
  'fire': p(['Fire! Fire in the ship!', 'Fire below, sir!'], ['Feuer! Feuer im Schiff!', 'Feuer unter Deck, Herr Kapitän!']),
  'fire out': p(["The fire's out, sir.", "Fire's out, sir."], ['Das Feuer ist aus, Herr Kapitän.', 'Feuer gelöscht, Herr Kapitän.']),
  'steering': p(['The wheel ropes are shot away, sir!', "She won't answer the helm, sir!"], ['Die Ruderreepe sind weggeschossen, Herr Kapitän!', 'Sie gehorcht dem Ruder nicht, Herr Kapitän!']),
  'struck her': p(["We're aboard her, sir!", "We've run foul of her!"], ['Wir sind längsseits, Herr Kapitän!', 'Wir haben sie gerammt!']),
  'fouled': p(["We're foul of her rigging, sir!"], ['Wir hängen in ihrer Takelage, Herr Kapitän!']),
  'beaten': p(['We must strike, sir.', "She's beaten, sir. We must strike."], ['Wir müssen streichen, Herr Kapitän.', 'Sie ist geschlagen, Herr Kapitän. Wir müssen streichen.']),
  'look out': p(['She bears {where}, sir, {how}, {canvas}.', 'Deck there! She lies {where}, {how}, {canvas}.'], ['Sie peilt {where}, Herr Kapitän, {how}, {canvas}.', 'An Deck! Sie liegt {where}, {how}, {canvas}.']),
  'look out ports': p(['Her ports are open, sir.', 'Her guns are run out, sir.'], ['Ihre Stückpforten sind offen, Herr Kapitän.', 'Ihre Kanonen sind ausgerannt, Herr Kapitän.']),
  // ---- The first match (plan N7.4, app/lessons.ts): the first lieutenant teaching a new captain ----
  'lesson.welcome': p(["Welcome aboard, sir. She's yours, and so are we."], ['Willkommen an Bord, Herr Kapitän. Sie gehört Ihnen, und wir mit ihr.']),
  'lesson.orders': p(['You never haul a rope yourself, sir. {Tap} one of us, on deck or by the icons along the foot of the view, and give your order.'], ['Sie selbst fassen kein Tau an, Herr Kapitän. {Tap} Sie einen von uns an, an Deck oder an den Zeichen am unteren Bildrand, und geben Sie Ihren Befehl.']),
  'lesson.look': p(['Drag a finger across the view to look about you, sir.'], ['Ziehen Sie den Finger über das Bild, um sich umzusehen, Herr Kapitän.']),
  'lesson.look.again': p(['Look about you, sir: drag across the view.'], ['Sehen Sie sich um, Herr Kapitän: ziehen Sie über das Bild.']),
  'lesson.walk': p(['Now walk aft to the wheel, sir, to the master. Your left thumb walks you.'], ['Gehen Sie nun nach achtern zum Ruder, Herr Kapitän, zum Steuermann. Der linke Daumen lässt Sie gehen.']),
  'lesson.walk.again': p(['The master, sir, at the wheel. Hold your left thumb down and push the way you would go.'], ['Der Steuermann, Herr Kapitän, am Ruder. Halten Sie den linken Daumen auf das Bild und schieben Sie in Ihre Richtung.']),
  'lesson.walk.well': p(['That is the master, sir. Every course and every turn goes through him.'], ['Das ist der Steuermann, Herr Kapitän. Jeder Kurs und jede Wende geht über ihn.']),
  'lesson.glass': p(['There she is, sir, {where}. Take the glass to see her.'], ['Da ist sie, Herr Kapitän, {where}. Nehmen Sie das Fernrohr.']),
  'lesson.glass.again': p(['The glass, sir: the tag at the foot of the view, on the right.'], ['Das Fernrohr, Herr Kapitän: das Schild unten rechts.']),
  'lesson.sail': p(["She lies hove to, waiting for us. Let's make sail, sir: {tap} me, then Make sail, then Plain sail."], ['Sie liegt beigedreht und wartet auf uns. Setzen wir Segel, Herr Kapitän: {tap} Sie mich an, dann Segel setzen, dann Normale Segel.']),
  'lesson.sail.again': p(['{Tap} me, sir: Make sail, then Plain sail.'], ['{Tap} Sie mich an, Herr Kapitän: Segel setzen, dann Normale Segel.']),
  'lesson.sail.well': p(['Away aloft they go, sir. More canvas, more way.'], ['Hinauf in die Wanten, Herr Kapitän. Mehr Tuch, mehr Fahrt.']),
  'lesson.by': p(['To tack she must first lie close to the wind, sir. {Tap} the master, then Keep her, then Full and by.'], ['Zum Wenden muss sie erst hoch am Wind liegen, Herr Kapitän. {Tap} Sie den Steuermann an, dann Halten, dann Hoch am Wind.']),
  'lesson.by.again': p(['The master, sir: Keep her, then Full and by.'], ['Der Steuermann, Herr Kapitän: Halten, dann Hoch am Wind.']),
  'lesson.tack': p(['Now bring her about through the wind, sir: {tap} the master, then About, then Tack.'], ['Nun wenden wir durch den Wind, Herr Kapitän: {tap} Sie den Steuermann an, dann Kurswechsel, dann Wenden.']),
  'lesson.tack.again': p(['The master, sir: About, then Tack.'], ['Der Steuermann, Herr Kapitän: Kurswechsel, dann Wenden.']),
  'lesson.tack.stations': p(['Watch, sir: the hands go to their stations, she comes up into the wind, the sails shiver, and through she goes.'], ['Sehen Sie, Herr Kapitän: die Leute gehen auf Station, sie luvt an, die Segel killen, und herum geht sie.']),
  'lesson.tack.missed': p(['She missed stays, sir. Let her gather way, then give it again.'], ['Die Wende ist misslungen, Herr Kapitän. Lassen Sie sie Fahrt aufnehmen, dann noch einmal.']),
  'lesson.tack.well': p(['Neatly done, sir. A tack loses way: in a fight, choose your moment.'], ['Sauber, Herr Kapitän. Eine Wende kostet Fahrt: im Gefecht wählen Sie den Augenblick.']),
  'lesson.follow': p(['Now take us to her, sir. {Tap} the master, then Keep her, then Steer for her.'], ['Nun zu ihr, Herr Kapitän. {Tap} Sie den Steuermann an, dann Halten, dann Auf sie zu.']),
  'lesson.follow.again': p(['The master, sir: Keep her, then Steer for her.'], ['Der Steuermann, Herr Kapitän: Halten, dann Auf sie zu.']),
  'lesson.follow.well': p(["He'll steer for her now, sir, tacking or wearing as he must."], ['Er hält jetzt auf sie zu, Herr Kapitän, und wendet oder halst, wo er muss.']),
  'lesson.quarters': p(["She's filling, sir! She comes for us. Beat to quarters: {tap} me, then Beat to quarters."], ['Sie nimmt Fahrt auf, Herr Kapitän! Sie kommt. Klar Schiff: {tap} Sie mich an, dann Klar Schiff zum Gefecht.']),
  'lesson.quarters.again': p(['Beat to quarters, sir! {Tap} me.'], ['Klar Schiff zum Gefecht, Herr Kapitän! {Tap} Sie mich an.']),
  'lesson.quarters.well': p(['Hear the drum, sir. The guns are cast loose, loaded and run out.'], ['Hören Sie die Trommel, Herr Kapitän. Die Kanonen werden losgemacht, geladen und ausgerannt.']),
  'lesson.hold': p(["We'll fire together, on your word. {Tap} the gunner in the waist, then Hold."], ['Wir feuern gemeinsam, auf Ihr Wort. {Tap} Sie den Stückmeister in der Kuhl an, dann Halten.']),
  'lesson.hold.again': p(['The gunner, sir, in the waist: Hold, for your word.'], ['Der Stückmeister, Herr Kapitän, in der Kuhl: Halten, bis zu Ihrem Wort.']),
  'lesson.hold.well': p(["He'll tell you when the guns bear, sir."], ['Er meldet, wenn die Kanonen tragen, Herr Kapitän.']),
  'lesson.abeam': p(["She's close, sir. Lay us alongside: {tap} the master, then Keep her, then Her on the beam."], ['Sie ist nah, Herr Kapitän. Legen Sie uns längsseits: {tap} Sie den Steuermann an, dann Halten, dann Sie querab.']),
  'lesson.abeam.again': p(['The master, sir: Keep her, then Her on the beam.'], ['Der Steuermann, Herr Kapitän: Halten, dann Sie querab.']),
  'lesson.abeam.well': p(["He'll hold her on our beam at this range, sir."], ['Er hält sie auf diesem Abstand querab, Herr Kapitän.']),
  'lesson.fire': p(['The guns bear, sir! Give the word: Fire!, by your thumb.'], ['Die Kanonen tragen, Herr Kapitän! Geben Sie das Wort: Feuer!, unter Ihrem Daumen.']),
  'lesson.fire.again': p(['Your word, sir! Fire!'], ['Ihr Wort, Herr Kapitän! Feuer!']),
  'lesson.fire.well': p(['Well fired, sir! A broadside on your word strikes hardest when the whole side bears and our deck comes up level.'], ['Gut geschossen, Herr Kapitän! Eine Breitseite auf Ihr Wort trifft am härtesten, wenn die ganze Seite trägt und unser Deck waagerecht kommt.']),
  'lesson.volley': p(['A fine broadside, sir! Now let us keep it up: {tap} me, then Fire as they bear. Each gun fires as soon as it is loaded and bears.'], ['Eine schöne Breitseite, Herr Kapitän! Jetzt halten wir das Feuer: {tap} Sie mich an, dann Feuer, wie sie tragen. Jede Kanone feuert, sobald sie geladen ist und trägt.']),
  'lesson.volley.again': p(['The gunner, sir: Fire as they bear, and we keep her under fire.'], ['Der Stückmeister, Herr Kapitän: Feuer, wie sie tragen, dann bleibt sie unter Feuer.']),
  'lesson.volley.well': p(["Aye, sir! We'll give it her as fast as we load."], ['Jawohl, Herr Kapitän! Sie kriegt es, so schnell wir laden.']),
  'lesson.fight': p(["Fight her so, sir: keep her on the beam and let them fire as they bear. She'll strike."], ['So kämpfen wir, Herr Kapitän: querab halten und feuern, wie sie tragen. Sie wird streichen.']),
  'lesson.below': p(["Your voice won't carry from below, sir. {Tap} me and I run with your order."], ['Von unten trägt Ihre Stimme nicht, Herr Kapitän. {Tap} Sie mich an, und ich laufe mit Ihrem Befehl.']),
  'lesson.aloft': p(['Up there they still hear you, sir: hail them as on deck. Below, the midshipman runs with your orders.'], ['Dort oben hört man Sie noch, Herr Kapitän: rufen Sie wie an Deck. Unter Deck läuft der Fähnrich mit Ihren Befehlen.']),
  'lesson.bear': p(['The guns are loaded, sir. You may tell me Fire as they bear: each gun fires as it bears, sooner, but fewer strike than a broadside on your word.'], ['Die Kanonen sind geladen, Herr Kapitän. Sie können mir auch sagen: Feuer, wie sie tragen. Jede feuert für sich, früher, aber es trifft weniger als eine Breitseite auf Ihr Wort.']),
  'lesson.pumps': p(['Water in the well, sir. I have sent hands to the pumps. Next time it is yours: {tap} me, then Her life.'], ['Wasser in der Bilge, Herr Kapitän. Ich habe Leute an die Pumpen geschickt. Nächstes Mal befehlen Sie es: {tap} Sie mich an, dann Schiff retten.']),
  'lesson.plug': p(["And the carpenter's crew are plugging the shot holes, sir."], ['Und die Zimmerleute stopfen die Schusslöcher, Herr Kapitän.']),
  'lesson.fires': p(['Fire aboard, sir! I have sent the fire party. Next time it is yours: {tap} me, then Her life.'], ['Feuer an Bord, Herr Kapitän! Ich habe den Löschtrupp geschickt. Nächstes Mal befehlen Sie es: {tap} Sie mich an, dann Schiff retten.']),
  'lesson.wreckage': p(['Wreckage alongside, sir. {Tap} me, then Her life, then Clear the wreckage.'], ['Wrack längsseits, Herr Kapitän. {Tap} Sie mich an, dann Schiff retten, dann Wrack kappen.']),
  'lesson.won': p(['She strikes, sir! Your first command, and a victory.'], ['Sie streicht, Herr Kapitän! Ihr erstes Kommando, und ein Sieg.']),
  'lesson.next': p(['A real match gives you a captain who fights back from the start, in any wind, or another player.'], ['Ein echtes Gefecht bringt einen Kapitän, der sich von Anfang an wehrt, jeden Wind, oder einen zweiten Spieler.']),
  'lesson.lost': p(['No shame in it, sir. Try her again, and hold her on the beam.'], ['Keine Schande, Herr Kapitän. Versuchen Sie es noch einmal, und halten Sie sie querab.']),
  // The same lessons for a captain with a mouse and keys (lessons.ts picks `<line>.mouse` where there is one).
  'lesson.look.mouse': p(['Drag with the mouse to look about you, sir.'], ['Ziehen Sie mit der Maus, um sich umzusehen, Herr Kapitän.']),
  'lesson.look.again.mouse': p(['Look about you, sir: drag with the mouse.'], ['Sehen Sie sich um, Herr Kapitän: ziehen Sie mit der Maus.']),
  'lesson.walk.mouse': p(['Now walk aft to the wheel, sir, to the master. W, A, S and D walk you.'], ['Gehen Sie nun nach achtern zum Ruder, Herr Kapitän, zum Steuermann. W, A, S und D lassen Sie gehen.']),
  'lesson.walk.again.mouse': p(['The master, sir, at the wheel. W walks you forward, S back, A and D to the sides.'], ['Der Steuermann, Herr Kapitän, am Ruder. W geht vor, S zurück, A und D zur Seite.']),
  'lesson.glass.again.mouse': p(['The glass, sir: the Q key, or the tag at the foot of the view, on the right.'], ['Das Fernrohr, Herr Kapitän: die Taste Q, oder das Schild unten rechts.']),
  'lesson.fire.mouse': p(['The guns bear, sir! Give the word: click Fire!, or press F.'], ['Die Kanonen tragen, Herr Kapitän! Geben Sie das Wort: klicken Sie Feuer!, oder drücken Sie F.']),
  'lesson.dot': p(['With the mouse taken, sir, put the brass dot on a man and click. Esc frees the mouse.'], ['Ist die Maus gefangen, Herr Kapitän, legen Sie den Messingpunkt auf einen Mann und klicken Sie. Esc gibt die Maus frei.']),
  'lesson.fire.again.mouse': p(['Your word, sir! Fire!, or F.'], ['Ihr Wort, Herr Kapitän! Feuer!, oder F.']),
  // ---- The midshipman carrying an order ----
  'midshipman off': p(['Aye aye, sir! To the {who}!', 'At once, sir!'], ['Jawohl, Herr Kapitän! Zum {who}!', 'Sofort, Herr Kapitän!']),
} as const satisfies Readonly<Record<string, Phrase>>;
export type Line = keyof typeof PHRASES;

/** The words filled into a line (`{side}`, `{mast}`, `{where}`, `{who}`, `{how}`, `{canvas}`), in each language. */
export const TERMS = {
  larboard: { en: 'Larboard', de: 'Backbord' },
  starboard: { en: 'Starboard', de: 'Steuerbord' },
  fore: { en: 'fore', de: 'Fock' },
  main: { en: 'main', de: 'Groß' },
  ahead: { en: 'dead ahead', de: 'recht voraus' },
  'larboard bow': { en: 'on the larboard bow', de: 'an Backbord voraus' },
  'starboard bow': { en: 'on the starboard bow', de: 'an Steuerbord voraus' },
  'larboard beam': { en: 'on the larboard beam', de: 'an Backbord querab' },
  'starboard beam': { en: 'on the starboard beam', de: 'an Steuerbord querab' },
  'larboard quarter': { en: 'on the larboard quarter', de: 'an Backbord achteraus' },
  'starboard quarter': { en: 'on the starboard quarter', de: 'an Steuerbord achteraus' },
  astern: { en: 'right astern', de: 'recht achteraus' },
  closing: { en: 'standing toward us', de: 'hält auf uns zu' },
  opening: { en: 'standing away', de: 'läuft von uns weg' },
  crossing: { en: 'crossing', de: 'quer zu uns' },
  'under bare': { en: 'under bare poles', de: 'vor Topp und Takel' },
  'under battle': { en: 'under battle sail', de: 'unter Gefechtssegeln' },
  'under plain': { en: 'under plain sail', de: 'unter normalen Segeln' },
  'under all': { en: 'under all sail', de: 'unter allen Segeln' },
  'to master': { en: 'master', de: 'Steuermann' },
  'to first lieutenant': { en: 'first lieutenant', de: 'Ersten Leutnant' },
  'to gunner': { en: 'gunner', de: 'Stückmeister' },
  'to carpenter': { en: 'carpenter', de: 'Zimmermann' },
  'to lookout': { en: 'lookout', de: 'Ausguck' },
  'to boatswain': { en: 'boatswain', de: 'Bootsmann' },
  'to surgeon': { en: 'surgeon', de: 'Schiffsarzt' },
  // How the captain touches a man, as the first match's lessons ask it (lessons.ts): by finger, or with the mouse.
  tap: { en: 'tap', de: 'tippen' },
  Tap: { en: 'Tap', de: 'Tippen' },
  click: { en: 'click', de: 'klicken' },
  Click: { en: 'Click', de: 'Klicken' },
} as const satisfies Readonly<Record<string, Readonly<Record<Language, string>>>>;
export type Term = keyof typeof TERMS;

/** Each speaker's rank as the bubble names him (small brass capitals over his words). */
export const RANKS: Readonly<Record<Voice, Readonly<Record<Language, string>>>> = {
  master: { en: 'Master', de: 'Steuermann' },
  'first lieutenant': { en: 'First Lieutenant', de: 'Erster Leutnant' },
  gunner: { en: 'Gunner', de: 'Stückmeister' },
  carpenter: { en: 'Carpenter', de: 'Zimmermann' },
  lookout: { en: 'Lookout', de: 'Ausguck' },
  midshipman: { en: 'Midshipman', de: 'Fähnrich' },
  boatswain: { en: 'Boatswain', de: 'Bootsmann' },
  surgeon: { en: 'Surgeon', de: 'Schiffsarzt' },
};

/** A line's variants for a crew of `navy` in `language`. */
export function variants(line: Line, language: Language, navy: Navy): readonly string[] {
  const ph: Phrase = PHRASES[line];
  return (navy === 'french' && ph.french ? ph.french : ph)[language];
}

/** A line's `variant` (any whole number: it wraps) in `language`, its terms filled. */
export function phraseWords(line: Line, language: Language, navy: Navy, variant: number, terms: Readonly<Record<string, Term>> = {}): string {
  const all = variants(line, language, navy), text = all[((variant % all.length) + all.length) % all.length]!;
  return text.replace(/\{(\w+)\}/g, (_, name: string) => {
    const t = terms[name];
    return t ? TERMS[t][language] : '';
  });
}
