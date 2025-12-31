const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL;
const WHATSAPP_TOKEN = process.env.WHATSAPP_API_KEY;

const sendWhatsAppMessage = async (payload) => {
  try {

    console.log("Sending WhatsApp message:", payload);
    console.log("WhatsApp API URL:", WHATSAPP_API_URL);
    const response = await fetch(
      `${WHATSAPP_API_URL}/admin/instent-message`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        },
        body: JSON.stringify(payload),
        timeout: 10000, // 10 seconds
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        `WhatsApp API Error ${response.status}: ${data.message || "Unknown error"}`
      );
    }

    return data;
  } catch (error) {

    console.error("WhatsApp send failed:", error.message);
    throw error; // important
  }
};

module.exports = { sendWhatsAppMessage };
