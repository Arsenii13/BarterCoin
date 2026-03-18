import { renderMarket, renderSell } from "./marketplace.js";
import { renderWallet } from "./wallet.js";
import { renderChat } from "./chat.js";
import { renderProfile } from "./profile.js";
import { renderAdmin } from "./admin.js";

const app = document.getElementById("app");

window.navigate = async (page) => {
  app.innerHTML = "Loading...";

  switch(page) {
    case "market": renderMarket(app); break;
    case "sell": renderSell(app); break;
    case "wallet": renderWallet(app); break;
    case "chat": renderChat(app); break;
    case "profile": renderProfile(app); break;
    case "admin": renderAdmin(app); break;
  }
};