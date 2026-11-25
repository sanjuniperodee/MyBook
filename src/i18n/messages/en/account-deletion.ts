import type { accountDeletion as ru } from "../ru/account-deletion";

export const accountDeletion: typeof ru = {
  title: "Delete account",
  intro: "The account is deleted permanently — it, your books and your messages cannot be restored.",
  items: [
    "Profile: name, e-mail, phone and password. You will be signed out on all devices at once",
    "Books: texts, photos, letters from loved ones, your own video and audio, print files",
    "Our copy of your messages with us on WhatsApp and in the site chat, call recordings. The WhatsApp chat itself stays on your phone",
    "Reviews, AI designer requests and phone notifications",
  ],
  accounting: "Orders and payments stay in our accounting records without your contact details, as accounting law requires.",
  keptOrder: "Order No. {n} is already in progress: we will deliver it, then delete the book and the recipient's address and phone.",
  password: "Password to confirm",
  forgot: "Forgot your password? Set a new one via “Forgot password” on the sign-in page.",
  next: "Delete account…",
  confirmTitle: "Delete permanently?",
  confirm: "Yes, delete permanently",
  cancel: "Cancel",
  done: "Account deleted.",
  staff: "Staff accounts are disabled by a manager in the CRM.",
};
