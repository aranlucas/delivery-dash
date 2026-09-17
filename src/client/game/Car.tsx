import { CarVisual } from "./CarVisual";
import { useOwnCarController, type OwnCarProps } from "./ownCarController";

export { CarVisual };

export function OwnCar(props: OwnCarProps) {
  const { color, carrying } = props;
  const { group, visual } = useOwnCarController(props);
  return (
    <group ref={group}>
      <group ref={visual}>
        <CarVisual color={color} carrying={carrying} own />
      </group>
    </group>
  );
}
