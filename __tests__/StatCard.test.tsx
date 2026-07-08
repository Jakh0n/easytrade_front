import { render, screen } from "@testing-library/react";
import { StatCard } from "@/components/common/StatCard";

describe("StatCard", () => {
  it("renders label, value and hint", () => {
    render(<StatCard label="Win rate" value="50%" hint="5W / 5L" />);
    expect(screen.getByText("Win rate")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("5W / 5L")).toBeInTheDocument();
  });
});
