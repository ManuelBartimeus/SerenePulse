// Registry of every proposal form (one per product in products.ts).
import type { FormDefinition } from '../schema';
import { motor } from './motor';
import { travel } from './travel';
import { homeFlexi } from './home-flexi';
import { fire } from './fire';
import { fireBurglary } from './fire-burglary';
import { burglaryPrivate } from './burglary-private';
import { burglaryBusiness } from './burglary-business';
import { businessInterruption } from './business-interruption';
import { personalAccident } from './personal-accident';
import { groupPersonalAccident } from './group-personal-accident';
import { workmensCompensation } from './workmens-compensation';
import { publicLiability } from './public-liability';
import { generalLiability } from './general-liability';
import { professionalIndemnity } from './professional-indemnity';
import { directorsOfficers } from './directors-officers';
import { cyber } from './cyber';
import { fidelityGuarantee } from './fidelity-guarantee';
import { bankersIndemnity } from './bankers-indemnity';
import { money } from './money';
import { goodsInTransit } from './goods-in-transit';
import { marineCargo } from './marine-cargo';
import { marineHull } from './marine-hull';
import { stevedore } from './stevedore';
import { contractorsAllRisk } from './contractors-all-risk';
import { erectionAllRisk } from './erection-all-risk';
import { electronicEquipment } from './electronic-equipment';
import { plantMachinery } from './plant-machinery';
import { bonds } from './bonds';

export const FORMS: Readonly<Record<string, FormDefinition>> = Object.fromEntries(
  [
    motor,
    travel,
    homeFlexi,
    fire,
    fireBurglary,
    burglaryPrivate,
    burglaryBusiness,
    businessInterruption,
    personalAccident,
    groupPersonalAccident,
    workmensCompensation,
    publicLiability,
    generalLiability,
    professionalIndemnity,
    directorsOfficers,
    cyber,
    fidelityGuarantee,
    bankersIndemnity,
    money,
    goodsInTransit,
    marineCargo,
    marineHull,
    stevedore,
    contractorsAllRisk,
    erectionAllRisk,
    electronicEquipment,
    plantMachinery,
    bonds,
  ].map((f) => [f.id, f]),
);

export const formById = (id: string): FormDefinition | undefined => FORMS[id];
