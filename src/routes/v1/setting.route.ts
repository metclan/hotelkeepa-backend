import { createBusiness, getCurrencies, getCountries} from "../../controllers/setting.controller..js";
import { Router } from "express";

const router = Router();
router
    .get('/countries', getCountries)
    .get('/currencies', getCurrencies)
    .post("/", createBusiness);

export { router as settingRouter }