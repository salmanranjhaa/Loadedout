# Journeys – Loaded Out

On-screen texts are quoted from the English UI.

UI language: English (en). The app ships no other language. Money is shown in CHF.

General notes for every journey:
- Loaded Out is a web app laid out for a phone screen. The tab bar at the bottom has seven tabs: Schedule, Meals, Workout, Budget, Pantry, Analytics and AI. After signing in, the app opens on Schedule.
- Some labels are shown in capital letters on screen (for example "WED" or "BREAKFAST"); the steps quote them as the app spells them.
- Several buttons are icons without text: the round + button at the bottom right of a screen (just above the tab bar), the round profile button at the top right (it shows your initials, or "LO" for a new account), pencil icons (edit), bin icons (delete) and tick buttons (mark a set as done).
- Short confirmation and error messages appear at the top of the screen for a few seconds. Look for them right after you tap.
- The test environment has no internet. Don't use the AI tab, the Photo, Barcode or AI tabs when adding food, the AI Recipe Importer, "Continue with Google" or the Google "Connect" chip on Schedule. When you search for a food, pick the built-in food named in the step; it appears right away, even if a "Searching food database…" line shows for a moment.
- "Close the app and open it again" means closing the browser tab or reloading the page, then going back to the same screen.
- Accounts: J1 creates its own account. In every other journey, if you see the sign-in screen, tap Sign up and create an account: a username nobody has used (for example your persona id plus four random digits), the e-mail address made of that username followed by @test.invalid, and the password Test1234 in both password fields. Then tap Create account. If the "Welcome to LoadedOut" screen appears, tap Skip for now.

## J1: Create an account and get daily targets
Actor: any
Goal: A new user signs up and answers the short setup questions, so the app gives them daily calorie and macro targets they can trust, and keeps them after they sign in again.
Steps:
1. Open the app. On the sign-in screen, tap Sign up.
2. Enter a new username and an e-mail address ending in @test.invalid. Type Test1234 as Password and Test12345 as Confirm Password, then tap Create account.
3. Type abc1 in both password fields and tap Create account again.
4. Type Test1234 in both password fields and tap Create account.
5. On "Welcome to LoadedOut", tap Continue. On "About you", type 5 as the weight and try to tap Continue.
6. Change the weight to 68, type 165 as the height and 30 as the age, tap Female, then tap Continue.
7. On "Your goal", type 62 as the target weight, choose "Lightly active" and "Lose ~0.5 kg/week", then tap Continue.
8. Read "Your daily targets" and tap Start Tracking.
9. Open the Meals tab. Then tap the round profile button, tap Full settings, and read Body Metrics and Nutrition Targets.
10. Scroll down, tap Sign out, then sign in again with the same username and Test1234.
Must hold:
- With different passwords in the two fields, the screen says "Passwords do not match" and no account is created.
- With the too-short password abc1, the message explains in plain words that the password is too short; a bare error code is not enough.
- With a weight of 5 kg, Continue can't be used, and the screen tells you which value is wrong.
- "Your daily targets" shows Calories 1430 kcal, Protein 136 g, Carbs 125 g and Fat 43 g.
- After Start Tracking, the message "You're all set — targets saved" appears.
- On Meals, the ring reads "of 1430 kcal" and the Protein bar ends in "/136g".
- In Profile & Settings, Body Metrics shows 68 kg, 165 cm, 30 years and female, and Nutrition Targets shows 1430 kcal, 136 g, 125 g and 43 g.
- After signing in again, the welcome screens don't come back and the Meals ring still reads "of 1430 kcal".

## J2: Build a workout template and log a session from it
Actor: any
Goal: A lifter sets up a reusable "Push Day" template once and logs today's session from it, so every set, the total volume and any new personal records end up in the workout history.
Steps:
1. Open the Workout tab, tap the round + button at the bottom right, then tap New Template.
2. Type Push Day as the Template Name, keep the type strength, and tap Save Template before adding any exercise.
3. Tap Add Exercise, search for bench press, open "Barbell Bench Press - Medium Grip" and tap Add to Workout.
4. Add "Dumbbell Shoulder Press" the same way, then tap Save Template.
5. In the Templates row, find the Push Day card and tap Start.
6. For the bench press, type 60 in KG and 8 in REPS, then tap the tick at the end of the row. If a "New PR!" card appears, tap it away.
7. Tap Add Set under the bench press, change REPS to 6 and tap the tick. For the shoulder press, type 20 in KG and 10 in REPS and tap the tick.
8. Tap Finish, read the summary, then tap Done.
9. Under Recent Workouts, open the Push Day entry, read it, and close it.
10. Close the app and open it again, then go back to the Workout tab.
Must hold:
- Saving the template with no exercises keeps the form open and creates no template (a short "Add at least one exercise" message may flash at the top).
- The Push Day card shows "2 exercises", and Start opens a session titled "Push Day" with both exercises listed and a running timer.
- After a set is ticked, a "Rest" countdown appears at the top of the session.
- The summary shows "Sets 3", "Exercises 2" and a volume of 1,040 kg (60×8 + 60×6 + 20×10), and celebrates 2 new personal records.
- The Workout header says "1 workout this week", and Push Day appears exactly once under Recent Workouts, with today's date, "3 sets" and "1,040 kg volume".
- The opened entry lists both exercises with their sets: 60kg × 8 and 60kg × 6 for the bench press, 20kg × 10 for the shoulder press.
- After reopening the app, the Push Day template and the logged workout are both still there.

## J3: Log meals and keep the day's totals right
Actor: any
Goal: Someone tracking their food logs breakfast and lunch from the built-in food list and fixes a mistake, so the day's calories on the Meals screen always match what they actually ate.
Steps:
1. Open the Meals tab and look at the ring and the Breakfast, Lunch, Dinner and Snacks groups.
2. Under Breakfast, tap Add to Breakfast. On the Foods tab, search for banana, tap Banana, keep 100 g and tap Add to Meal.
3. Under Lunch, tap Add to Lunch, search for chicken and tap Chicken Breast. Type 0 as the amount and try to tap Add to Meal.
4. Change the amount to 200, read the preview, and tap Add to Meal.
5. Tap the Chicken Breast entry, tap the pencil at the top right, change Calories (kcal) to -100 and tap Save changes.
6. Tap the pencil again, change Calories (kcal) to 300, tap Save changes, then go back to Meals.
7. Tap the bin icon on the Banana entry and confirm the deletion.
8. Close the app and open it again, then go back to the Meals tab.
Must hold:
- Before anything is logged, each group says "Nothing logged yet" and the ring shows 0.
- Breakfast lists the banana with its amount ("Banana (100 g)"), 89 kcal and "1 item".
- With 0 g, Add to Meal can't be used. With 200 g, the preview shows 330 kcal and 62g of protein.
- With the banana and the chicken logged, the ring shows 419 and the header says "419 kcal".
- A negative calorie value is refused with a clear message, and the ring never shows a total below zero.
- After changing the chicken to 300 kcal, Lunch shows 300 kcal and the ring shows 389.
- Deleting the banana asks for confirmation first. Afterwards, Breakfast says "Nothing logged yet" again and the ring shows 300.
- After reopening the app, Lunch still shows Chicken Breast with 300 kcal and the ring still shows 300.

## J4: Stock the pantry after shopping
Actor: any
Goal: After a grocery run, the user records what they bought in the Pantry, updates amounts as they cook and removes what is used up, so the list always shows what is really at home. The app has no separate shopping list; the Pantry is where groceries are tracked.
Steps:
1. Open the Pantry tab and look at the empty list.
2. Tap the round + button. In Add Item, leave the name empty and try to tap Add to Pantry.
3. Type Eggs as the item name and 6 as Qty, choose pieces as the unit and Protein as the category, then tap Add to Pantry.
4. Add Rice with 1 kg in Grains, and Greek Yogurt with 2 pieces in Dairy, the same way.
5. Tap the Grains filter, then tap All.
6. Open Eggs, tap the minus button twice, then go back.
7. Open Greek Yogurt, tap Remove from Pantry and confirm.
8. Go to another tab and back to Pantry. Then close the app, open it again and return to Pantry.
Must hold:
- The empty Pantry says "Nothing here" and "Tap + to add what's in your kitchen".
- Add to Pantry can't be used while the name is empty.
- Each item shows its category label, its name and its amount, for example Eggs with "6 pieces" and Rice with "1 kg".
- With three items, the filters read All 3, Protein 1, Grains 1 and Dairy 1, and the Grains filter shows only Rice.
- After the minus button is tapped twice, Eggs show 4 pieces on the item screen and in the list, also after reopening the app.
- Greek Yogurt disappears after Remove from Pantry and stays gone after switching tabs and after reopening the app; All then reads 2.

## J5: Track grocery spending against the monthly budget
Actor: any
Goal: A user on a fixed monthly income records it and logs this week's grocery shopping, partly paid by credit card, so they can see how much of the month's food budget is left, how much cash they have, and what remains once the card bill is paid.
Steps:
1. Open the Budget tab and look at "Balance this month" and the Food tile under "Category budgets".
2. Tap the round + button, choose Income, type 1500 as the amount, keep the Income category, type Monthly allowance as the source and tap Add Income.
3. Tap the + button again. With Expense selected, leave the amount empty, then type 0, and try to tap Add Expense.
4. Type 64.80 as the amount, choose Food, keep "Cash / debit" under Paid with, type Weekly groceries as the description and tap Add Expense.
5. Add another Food expense of 15.20 paid with "Cash / debit", described as Bakery.
6. Add a Food expense of 20 described as Takeaway, choose "Credit card" under Paid with, then read the balance card, the Food tile and the Transactions list.
7. Tap the + button, choose "Card bill", keep the suggested amount and tap "Record card payment". Read the balance card again.
8. Tap the Food tile, read the details, then go back.
9. Tap the round profile button, tap Full settings, choose EUR under Currency, then go back to Budget.
10. Close the app and open it again, then go back to the Budget tab.
Must hold:
- Add Expense can't be used while the amount is empty or 0, and the form says what's missing.
- After the four entries, the balance card shows +CHF 1400.00, with Income CHF 1500, Spent CHF 100 and Saved CHF 1400.
- Before the card is paid, the balance card also shows Cash balance +CHF 1420.00 and Card to pay CHF 20.00, because the takeaway went on the credit card.
- The Food tile shows CHF 100 / 400.
- The Transactions list under Today shows Monthly allowance, Weekly groceries, Bakery and Takeaway with their amounts, and Takeaway is marked "Credit card".
- "Card bill" suggests 20.00. After the card payment, Card to pay shows CHF 0.00 and Cash balance +CHF 1400.00, while the balance (+CHF 1400.00), Spent (CHF 100) and the Food tile stay the same, and a "Card payment" of CHF 20.00 appears under Today.
- The Food details show "CHF 300 remaining", 25%, "3 transactions this month", and the entries Weekly groceries (CHF 64.80), Bakery (CHF 15.20) and Takeaway (CHF 20.00).
- After EUR is chosen in the settings, the Budget screen shows its amounts in EUR, not CHF.
- After reopening the app, all entries, the totals and the cash and card figures are unchanged.

## J6: Plan the week's meals on the Schedule
Actor: any
Goal: The user blocks out lunch and dinner on a weekday in the Schedule, so their meal plan sits next to the rest of their routine and stays there.
Steps:
1. Open the Schedule tab and look at the header and the row of day buttons.
2. Tap the WED day button, then tap the round + button.
3. In "New event", leave the title empty and try to tap Save event.
4. Type Lunch: chicken and rice as the title, choose Meal, set Start to 12:30 and End to 13:00, type Home as the Location and tap Save event.
5. Add Dinner: salmon and potatoes as a Meal from 19:00 to 19:45.
6. Add Evening walk with Start 18:00 and End 17:00, and try to tap Save event. Then tap Cancel.
7. On the lunch event, tap the pencil, change End to 13:15 and tap Save event.
8. On the dinner event, tap the bin icon and confirm the deletion.
9. Tap THU, then WED again.
10. Close the app and open it again, go to Schedule and tap WED.
Must hold:
- The header shows the selected day and date, and today's day button is highlighted.
- Save event can't be used while the title is empty.
- Lunch: chicken and rice appears on the timeline at 12:30 and shows "12:30–13:00".
- An event that ends before it starts (18:00 to 17:00) is refused with a clear message instead of being saved.
- After the edit, the lunch event shows "12:30–13:15".
- The deleted dinner disappears right away and is still gone after reopening the app.
- Thursday does not show Wednesday's events, and after reopening the app Wednesday still shows the lunch event.

## J7: One full day from plan to summary
Actor: any
Goal: A user runs a whole day through the app: they plan lunch, stock the ingredients, pay for them, eat and train. At the end of the day, every screen should tell the same story.
Steps:
1. On the Schedule tab, with today selected, add a Meal event "Lunch: chicken and rice" from 12:30 to 13:00.
2. On the Pantry tab, add Chicken Breast (400 g, Protein) and Rice (1 kg, Grains).
3. On the Budget tab, add a Food expense of 23.40 described as Chicken and rice.
4. On the Meals tab, tap Add to Lunch and add Chicken Breast with 200 g. Then tap Add to Lunch again and add "Rice (white, cooked)" with 150 g.
5. On the Workout tab, tap the round + button, then Manual Log. Tap Add Exercise, search for pushups, open "Pushups" and tap Add to Workout.
6. Leave KG empty, type 15 in REPS and tap the tick. Tap Add Set, change REPS to 12 and tap the tick. Tap Finish, then Done.
7. Look at the Meals, Workout and Budget tabs again.
8. Open the Analytics tab and read the "This Week" card at the bottom.
9. Close the app and open it again, then check Schedule, Pantry, Budget, Meals and Workout once more.
Must hold:
- Today's Schedule shows "Lunch: chicken and rice" with "12:30–13:00".
- Pantry lists Chicken Breast with 400 g and Rice with 1 kg, and All reads 2.
- Budget shows Spent CHF 23, and the Food tile shows CHF 23 / 400.
- Meals shows Lunch with 525 kcal (330 for the chicken plus 195 for the rice), and the ring shows 525.
- The workout summary shows "Sets 2" and "Exercises 1"; the Workout tab says "1 workout this week", and Recent Workouts has exactly one entry for today, with "2 sets".
- The Analytics "This Week" card shows Workouts 1.
- After reopening the app, everything above is unchanged.
