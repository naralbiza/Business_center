import ContractsBoard from "@/components/contracts/ContractsBoard";
import { getContractsBoard } from "@/lib/contractsBoard";

export const instant = false;

export default async function Contratos() {
  const data = await getContractsBoard();
  return <ContractsBoard contracts={data.contracts} buildings={data.buildings} monthStart={data.monthStart} />;
}
