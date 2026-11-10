// Тестовая заявка: данные никуда не отправляются.
const form = document.querySelector("[data-signup]");

if (form) {
  const status = form.querySelector(".status");

  const rules = {
    name: (v) => (v.trim().length >= 2 ? "" : "Введіть ім'я (мінімум 2 символи)."),
    email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? "" : "Введіть коректну електронну пошту."),
  };

  const check = (input) => {
    const msg = rules[input.name]?.(input.value) ?? "";
    input.setAttribute("aria-invalid", msg ? "true" : "false");
    document.getElementById(`${input.id}-error`).textContent = msg;
    return !msg;
  };

  form.querySelectorAll("input[name]").forEach((input) => {
    input.addEventListener("blur", () => check(input));
    input.addEventListener("input", () => input.getAttribute("aria-invalid") === "true" && check(input));
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const inputs = [...form.querySelectorAll("input[name]")];
    const results = inputs.map(check);
    if (results.includes(false)) {
      inputs[results.indexOf(false)].focus();
      status.textContent = "";
      return;
    }
    status.textContent = "Дякуємо! Це тестова форма: дані не надсилались.";
    form.reset();
  });
}
