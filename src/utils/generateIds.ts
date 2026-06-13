interface Params {
  count: number;
  type: "BK";
}
const year = new Date().getFullYear().toString();
export const generatesIds = (params: Params) => {
  if (!params.type || !params.count) throw Error("Params not provided");
  if (params.type === "BK")
    return `BK-${year}-${String(params.count).padStart(4, "0")}`;
};
