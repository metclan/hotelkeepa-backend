import { PrismaClient } from "../src/generated/prisma/client.js";
import { permissionGroups } from "../src/lib/permissions.js";
const prisma = new PrismaClient();

async function main() {
  console.log("Starting seeding...");

  // Create countries based on currencies
  const countries = [
    {
      name: "India",
      code: "IN",
      phoneCode: "+91",
    },
    {
      name: "United States",
      code: "US",
      phoneCode: "+1",
    },
    {
      name: "European Union",
      code: "EU",
      phoneCode: null,
    },
    {
      name: "United Kingdom",
      code: "GB",
      phoneCode: "+44",
    },
    {
      name: "Japan",
      code: "JP",
      phoneCode: "+81",
    },
    {
      name: "South Korea",
      code: "KR",
      phoneCode: "+82",
    },
    {
      name: "Israel",
      code: "IL",
      phoneCode: "+972",
    },
    {
      name: "Vietnam",
      code: "VN",
      phoneCode: "+84",
    },
    {
      name: "Bangladesh",
      code: "BD",
      phoneCode: "+880",
    },
    {
      name: "Russia",
      code: "RU",
      phoneCode: "+7",
    },
    {
      name: "Brazil",
      code: "BR",
      phoneCode: "+55",
    },
    {
      name: "Ukraine",
      code: "UA",
      phoneCode: "+380",
    },
    {
      name: "Kazakhstan",
      code: "KZ",
      phoneCode: "+7",
    },
    {
      name: "Taiwan",
      code: "TW",
      phoneCode: "+886",
    },
    {
      name: "Indonesia",
      code: "ID",
      phoneCode: "+62",
    },
    {
      name: "Nigeria",
      code: "NG",
      phoneCode: "+234",
    },
  ];

  // Create currencies
  const currencies = [
    {
      code: "INR",
      name: "Indian Rupee",
      symbol: "₹",
      countryCode: "IN",
      shortForm: "INR",
    },
    {
      code: "USD",
      name: "United States Dollar",
      symbol: "$",
      countryCode: "US",
      shortForm: "USD",
    },
    {
      code: "EUR",
      name: "Euro",
      symbol: "€",
      countryCode: "EU",
      shortForm: "EUR",
    },
    {
      code: "GBP",
      name: "British Pound Sterling",
      symbol: "£",
      countryCode: "GB",
      shortForm: "GBP",
    },
    {
      code: "JPY",
      name: "Japanese Yen",
      symbol: "¥",
      countryCode: "JP",
      shortForm: "JPY",
    },
    {
      code: "KRW",
      name: "South Korean Won",
      symbol: "₩",
      countryCode: "KR",
      shortForm: "KRW",
    },
    {
      code: "ILS",
      name: "Israeli Shekel",
      symbol: "₪",
      countryCode: "IL",
      shortForm: "ILS",
    },
    {
      code: "VND",
      name: "Vietnamese Dong",
      symbol: "₫",
      countryCode: "VN",
      shortForm: "VND",
    },
    {
      code: "BDT",
      name: "Bangladeshi Taka",
      symbol: "৳",
      countryCode: "BD",
      shortForm: "BDT",
    },
    {
      code: "RUB",
      name: "Russian Ruble",
      symbol: "₽",
      countryCode: "RU",
      shortForm: "RUB",
    },
    {
      code: "BRL",
      name: "Brazilian Real",
      symbol: "R$",
      countryCode: "BR",
      shortForm: "BRL",
    },
    {
      code: "UAH",
      name: "Ukrainian Hryvnia",
      symbol: "₴",
      countryCode: "UA",
      shortForm: "UAH",
    },
    {
      code: "KZT",
      name: "Kazakhstani Tenge",
      symbol: "₸",
      countryCode: "KZ",
      shortForm: "KZT",
    },
    {
      code: "TWD",
      name: "New Taiwan Dollar",
      symbol: "NT$",
      countryCode: "TW",
      shortForm: "TWD",
    },
    {
      code: "IDR",
      name: "Indonesian Rupiah",
      symbol: "Rp",
      countryCode: "ID",
      shortForm: "IDR",
    },
    {
      code: "NGN",
      name: "Nigerian Naira",
      symbol: "₦",
      countryCode: "NG",
      shortForm: "NGN",
    },
  ];

  // Seed permissions
  for (const permissionGroup of permissionGroups) {
    const newPermissionGroup = await prisma.permissionGroup.upsert({
      where: {
        code: permissionGroup.code,
      },
      update: {
        code: permissionGroup.code,
        description: permissionGroup.description,
        name: permissionGroup.name,
      },
      create: {
        code: permissionGroup.code,
        description: permissionGroup.description,
        name: permissionGroup.name,
      },
    });
    for (const permission of permissionGroup.permissions) {
      await prisma.permission.upsert({
        where: {
          code: permission.code,
        },
        update: { code: permission.code, name: permission.name },
        create: {
          code: permission.code,
          name: permission.name,
          permissionGroupId: newPermissionGroup.id,
        },
      });
    }
  }

  // Seed countries
  for (const country of countries) {
    await prisma.country.upsert({
      where: {
        code: country.code,
      },
      update: {},
      create: country,
    });
  }

  // Seed currencies
  for (const currency of currencies) {
    const country = await prisma.country.findUnique({
      where: {
        code: currency.countryCode,
      },
    });

    if (!country) {
      console.error(
        `Country with code ${currency.countryCode} not found for currency ${currency.code}`,
      );
      continue;
    }

    await prisma.currency.upsert({
      where: {
        code: currency.code,
      },
      update: {},
      create: {
        code: currency.code,
        name: currency.name,
        symbol: currency.symbol,
        shortForm: currency.shortForm,
        country: {
          connect: {
            id: country.id,
          },
        },
      },
    });
  }

  console.log("Seeding completed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
