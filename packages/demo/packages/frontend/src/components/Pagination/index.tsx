import { Paginator } from "primereact/paginator";


interface PaginationProps {
  totalRecords: number;
  rows: number;
  first: number;
  onPageChange: (newPage: number) => void;
}

export const Pagination = ({
  totalRecords,
  rows,
  first,
  onPageChange,
}: PaginationProps)  =>{
  return (
    <Paginator
      first={first}
      rows={rows}
      totalRecords={totalRecords}
      onPageChange={(e) => onPageChange(e.page + 1)}
      template="PrevPageLink PageLinks NextPageLink"
      className="mt-4"
    />
  );
}
