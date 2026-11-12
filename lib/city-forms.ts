/** 城市共享建模入口；树木与车辆各自负责几何生成，实例化和资源生命周期由场景统一管理。 */
export { createTreeCanopy, createTreeTrunk, paintLeafCluster, thinLeafCards, type TreeForm } from "./city-trees";
export { createVehicleShell, createVehicleWheel, type VehicleKind, type VehicleShell } from "./city-vehicles";
